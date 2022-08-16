import {status as Status} from '@grpc/grpc-js';

export interface GrpcErrorResponse {
  status: Status;
  detail?: string;
}

export interface GrpcSuccessResponse {
  message: Uint8Array;
}

export type GrpcResponse = GrpcSuccessResponse | GrpcErrorResponse

function fourBytesLength(sized: { length: number }): Uint8Array {
  const arr = new Uint8Array(4); // an Int32 takes 4 bytes
  const view = new DataView(arr.buffer);
  view.setUint32(0, sized.length, false);
  return arr;
}

export class GrpcUnknownStatus extends Error {
  constructor(unknownStatus: unknown) {
    super(`An unknown status was provided: ${unknownStatus}`);
  }
}

export function grpcResponseToBuffer(
  response: GrpcResponse
): Buffer {

  // error messages need to have a zero length message field to be considered valid
  const message = 'message' in response ? response.message : new Uint8Array();

  // all success responses have status OK
  const status = 'status' in response ? response.status : Status.OK;
  // error statuses may the detail field to denote a custom error message, otherwise use the string version of the status
  let grpcMessage: string | undefined;

  if ('detail' in response) {
    grpcMessage = response.detail;
  } else {
    const currentStatus = Object.entries(Status).find(
      ([, code]) => code === status
    );

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
