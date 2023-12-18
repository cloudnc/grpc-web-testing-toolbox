import { expect, Page } from '@playwright/test';
import { GrpcResponse, grpcResponseToBuffer } from '../base';
import { MockedGrpcCall, UnaryMethodDefinitionish } from './interfaces';
import { readGrpcRequest } from './read-grpc-request';

export async function mockGrpcUnary(
  page: Page,
  rpc: UnaryMethodDefinitionish,
  response:
    | GrpcResponse
    | Promise<GrpcResponse>
    | ((request: Uint8Array | null) => GrpcResponse | Promise<GrpcResponse>),
  mockAtContextLevel: boolean = false,
): Promise<MockedGrpcCall> {
  const url = `/${rpc.service.serviceName}/${rpc.methodName}`;

  // note this wildcard route url base is done in order to match both localhost and deployed service usages.
  await (mockAtContextLevel ? page.context() : page).route('**' + url, async (route) => {
    expect(route.request().method(), 'ALL gRPC requests should be a POST request').toBe('POST');

    const grpcResponseWrapped = typeof response === 'function' ? response(readGrpcRequest(route.request())) : response;
    const grpcResponse = await Promise.resolve(grpcResponseWrapped);

    const grpcResponseBody = grpcResponseToBuffer(grpcResponse);

    return await route.fulfill({
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
        if (!req.url().endsWith(url)) {
          return false;
        }

        if (requestPredicate) {
          const unframed = readGrpcRequest(req);
          return requestPredicate(unframed, req);
        }

        return true;
      });

      await page.waitForResponse((resp) => resp.request() === request);

      const requestMessage = readGrpcRequest(request);

      return { requestMessage };
    },
  };
}
