import { Page } from '@playwright/test';
import { ObservedGrpcCall, RequestPredicate, UnaryMethodDefinitionish } from './interfaces';
import { decodeGrpcWebBody } from '../base';
import { status as Status } from '@grpc/grpc-js';
import { readGrpcRequest } from './read-grpc-request';

export async function observeGrpcUnary(page: Page, rpc: UnaryMethodDefinitionish): Promise<ObservedGrpcCall> {
  const url = `/${rpc.service.serviceName}/${rpc.methodName}`;

  // note this wildcard route url base is done in order to match both localhost and deployed service usages.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  await page.route('**' + url, async (route) => await route.continue());

  return {
    async waitForResponse(requestPredicate?: RequestPredicate) {
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

      const response = await page.waitForResponse((resp) => resp.request() === request);

      const requestMessage = readGrpcRequest(request);

      const responseParsed = await decodeGrpcWebBody(await response.body());

      const trailers = responseParsed.trailers ?? null;

      if ('status' in responseParsed) {
        return {
          requestMessage,
          responseMessage: null,
          statusCode: responseParsed.status,
          trailers,
        };
      }

      return {
        requestMessage,
        responseMessage: responseParsed.message,
        statusCode: Status.OK,
        trailers,
      };
    },
  };
}
