import { Metadata, status as Status } from '@grpc/grpc-js';

export interface GrpcErrorResponse {
  status: Status;
  detail?: string;
}

export interface GrpcSuccessResponse {
  message: Uint8Array;
}

export type GrpcResponse = (GrpcSuccessResponse | GrpcErrorResponse) & {
  trailers?: Metadata;
};

function fourBytesLength(sized: { length: number }): Uint8Array {
  const arr = new Uint8Array(4); // an Int32 takes 4 bytes
  const view = new DataView(arr.buffer);
  view.setUint32(0, sized.length, false);
  return arr;
}

export function decodeGrpcWebBody(bodyBuffer: Buffer): GrpcResponse {
  if (bodyBuffer.length === 0) {
    throw new Error('Body has zero length, cannot decode!');
  }

  const bodyRaw = new Uint8Array(bodyBuffer);

  // layout:
  // status code: 1 byte
  // message length 4 bytes (int32 big endian)
  // the message itself (len defined above)
  // trailer start byte: 0x80
  // trailers length (same format as above)
  // trailers: concatenated `key:value\r\n`
  let offset = 0;

  const status: number | undefined = bodyRaw.at(offset);
  offset += 1;

  if (status === undefined || !(status in Status)) {
    throw new Error(`Unrecognised status code [${status}]`);
  }

  const bodyLength = readInt32Length(bodyRaw, offset);
  offset += 4;

  const message = new Uint8Array(bodyRaw.subarray(offset, offset + bodyLength));

  offset += bodyLength;

  const trailersHeader = 0x80;

  if (bodyRaw.at(offset++) !== trailersHeader) {
    throw new Error('Expected trailers header 0x80');
  }

  const trailersLength = readInt32Length(bodyRaw, offset);

  offset += 4;

  const trailersView = new DataView(bodyRaw.buffer, offset, trailersLength);

  const trailersString = new TextDecoder().decode(trailersView).trim();

  const trailers = new Metadata();

  trailersString.split('\r\n').forEach((trailer) => {
    const [key, value] = trailer.split(':', 2);
    trailers.set(key, value);
  });

  if (status !== Status.OK) {
    return {
      status,
      trailers,
      detail: trailers.get('grpc-message')[0] as string | undefined,
    };
  }

  return {
    message,
    trailers,
  };
}

function readInt32Length(data: Uint8Array, offset: number = 0): number {
  const view = new DataView(data.buffer);

  return view.getInt32(offset, false);
}

export class GrpcUnknownStatus extends Error {
  constructor(unknownStatus: unknown) {
    super(`An unknown status was provided: ${unknownStatus}`);
  }
}

export function grpcResponseToBuffer(response: GrpcResponse): Buffer {
  // error messages need to have a zero length message field to be considered valid
  const message = 'message' in response ? response.message : new Uint8Array();

  // all success responses have status OK
  const status = 'status' in response ? response.status : Status.OK;
  // error statuses may the detail field to denote a custom error message, otherwise use the string version of the status
  let grpcMessage: string | undefined;

  if ('detail' in response) {
    grpcMessage = response.detail;
  } else {
    const currentStatus = Object.entries(Status).find(([, code]) => code === status);

    if (!currentStatus) {
      throw new GrpcUnknownStatus(status);
    }

    grpcMessage = currentStatus[0];
  }

  const trailerMessage = Buffer.concat([
    Buffer.from(`grpc-status:${status}\r\n`),
    Buffer.from(`grpc-message:${grpcMessage}\r\n`),
  ]);

  // follow the basic structure of a grpc message
  return Buffer.concat([
    // status
    new Uint8Array([status]),
    // bytes defining the length of the message
    fourBytesLength(message),
    // the message itself
    message,
    // start of the trailer
    new Uint8Array([0x80]),
    // bytes defining the length of the trailer message
    fourBytesLength(trailerMessage),
    trailerMessage,
  ]);
}

/**
 * Remove the header information from the request body. This is the reverse of the `frameRequest` function that
 * gRPC-Web applies to wrap the message body up for transport
 * @see https://github.com/improbable-eng/grpc-web/blob/53aaf4cdc0fede7103c1b06f0cfc560c003a5c41/client/grpc-web/src/util.ts#L3
 */
export function unframeRequest(requestBody: Uint8Array): Uint8Array {
  return new Uint8Array(requestBody).slice(5);
}
