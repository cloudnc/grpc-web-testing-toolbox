import { grpc } from "@improbable-eng/grpc-web";
import { Request } from "playwright-core";
import { status as Status, Metadata } from "@grpc/grpc-js";

export interface UnaryMethodDefinitionish
  extends grpc.UnaryMethodDefinition<any, any> {
  requestStream: any;
  responseStream: any;
}

export type RequestPredicate = (
  requestMessage: Uint8Array | null,
  request: Request
) => boolean | Promise<boolean>;

export interface MockedGrpcCall {
  /**
   * Wait for the mocked request. This is useful if you want to assert on the request body of an RPC call, or if you
   * need to wait for an endpoint to respond before continuing assertions
   *
   * The request message argument to the optional predicate should be used to match the request payload.
   * Note the requestMessage objects need to be decoded using a protobuf decoder for the specific expected message.
   */
  waitForMock(
    requestPredicate?: RequestPredicate
  ): Promise<{ requestMessage: Uint8Array | null }>;
}

export interface ObservedGrpcCallResponse {
  requestMessage: Uint8Array | null;
  responseMessage: Uint8Array | null;
  statusCode: Status;
  trailers: Metadata | null;
}

export interface ObservedGrpcCall {
  waitForResponse: (
    requestPredicate?: RequestPredicate
  ) => Promise<ObservedGrpcCallResponse>;
}
