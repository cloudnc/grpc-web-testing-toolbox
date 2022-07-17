import {expect, Page} from '@playwright/test';
import {grpc} from '@improbable-eng/grpc-web';
import {GrpcResponse, grpcResponseToBuffer,} from '../base';
import {Request} from 'playwright-core';

export interface UnaryMethodDefinitionish
  extends grpc.UnaryMethodDefinition<any, any> {
  requestStream: any;
  responseStream: any;
}

export interface MockedGrpcCall {
  /**
   * Wait for the mocked request. This is useful if you want to assert on the request body of an RPC call, or if you
   * need to wait for an endpoint to respond before continuing assertions
   *
   * The request message argument to the optional predicate should be used to match the request payload.
   * Note the requestMessage objects need to be decoded using a protobuf decoder for the specific expected message.
   */
  waitForMock(
    requestPredicate?: (
      requestMessage: Uint8Array | null,
      request: Request
    ) => boolean | Promise<boolean>
  ): Promise<{ requestMessage: Uint8Array | null }>;
}

/**
 * Remove the header information from the request body. This is the reverse of the `frameRequest` function that
 * gRPC-Web applies to wrap the message body up for transport
 * @see https://github.com/improbable-eng/grpc-web/blob/53aaf4cdc0fede7103c1b06f0cfc560c003a5c41/client/grpc-web/src/util.ts#L3
 */
function unframeRequest(requestBody: Uint8Array): Uint8Array {
  return new Uint8Array(requestBody).slice(5);
}

export function readGrpcRequest(request: Request): Uint8Array | null {
  const requestBody = request.postDataBuffer();
  return !requestBody ? null : unframeRequest(requestBody);
}

export function mockGrpcUnary(
  page: Page,
  rpc: UnaryMethodDefinitionish,
  response: GrpcResponse | ((request: Uint8Array|null) => GrpcResponse)
): MockedGrpcCall {
  const url = `/${rpc.service.serviceName}/${rpc.methodName}`;

  // note this wildcard route url base is done in order to match both localhost and deployed service usages.
  page.route('**' + url, (route) => {
    expect(
      route.request().method(),
      'ALL gRPC requests should be a POST request'
    ).toBe('POST');

    const grpcResponse = typeof response === 'function'
      ? response(readGrpcRequest(route.request()))
      : response;

    const grpcResponseBody = grpcResponseToBuffer(grpcResponse);

    return route.fulfill({
      body: grpcResponseBody,
      contentType: 'application/grpc-web+proto',
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  });

  return {
    async waitForMock(requestPredicate?) {
      const request = await page.waitForRequest((req) => {
        if (!req.url().includes(url)) {
          return false;
        }

        if (requestPredicate) {
          const unframed = readGrpcRequest(req);
          return requestPredicate(unframed, req);
        }

        return true;
      });

      await page.waitForResponse((resp) => resp.url().includes(url));

      const requestMessage = readGrpcRequest(request);

      return { requestMessage };
    },
  };
}
