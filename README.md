# grpc web testing toolbox

Utility functions to help you stub and assert on grpc calls.

For example, if you use [@improbable-eng/grpc-web](https://github.com/improbable-eng/grpc-web) to have grpc calls made directly from your browser and you want to cover this in your e2e tests, this toolbox will be helpful.

# Installation

```
yarn add --dev @cloudnc/grpc-web-testing-toolbox
```

# API

This repository contains 2 folders that you can import from:

- `base`: :arrow_right: `import {} from '@cloudnc/grpc-web-testing-toolbox/base'`
- `playwright`: :arrow_right: `import {} from '@cloudnc/grpc-web-testing-toolbox/playwright'`

## `base`

The base folder is **framework agnostic** and contains only 1 function: `grpcResponseToBuffer`.

The signature of the function is the following:

```ts
export function grpcResponseToBuffer(
  response: GrpcSuccessResponse | GrpcErrorResponse
): Buffer;
```

As the name and signature suggest, it's a small helper to convert a grpc response to a buffer.

## `playwright`

[Playwright](https://playwright.dev) is an e2e testing framework. It's open source and available on [Github](https://github.com/microsoft/playwright).

On top of the `base` we've built a dedicated Playwright helper that'll let you easily mock a grpc call but also assert on the params passed during the request and assert on the response.

Feel free to have a look at the code in that repo as it's quite short here: [`src/playwright/index.ts`](https://github.com/cloudnc/grpc-web-testing-toolbox/blob/master/src/playwright/index.ts) but basically we call [`page.route`](https://playwright.dev/docs/network#handle-requests) for you and use the function `grpcResponseToBuffer` defined into `@cloudnc/grpc-web-testing-toolbox/base` to correctly wrap the message.

Here's a complete example with Playwright:

```ts
import { expect, test } from '@playwright/test';

test.describe('Some test wrapper', () => {
  test('Make sure a grpc call is made and is successful', async ({ page }) => {
    // start by building a mock for the unary call that will be done
    // for example as soon as a given page is loaded
    const mock = await mockGrpcUnary(page, YourUnaryCall, {
      message: YourUnaryCallResponse.encode({
        // all the content of the response goes here as a classic JS object
        // this is the mock data that will be passed in the response
      }).finish(),
    });

    const [, mockRequest] = await Promise.all([
      // go to the page that will trigger the grpc call
      // but really this could be anything else like a
      // click on button triggering the grpc call instead
      page.goto('/some-page-where-a-grpc-call-will-be-made'),
      // make sure that the grpc call is made, if not this will fail
      mock.waitForMock(),
    ]);

    // at this stage we know the grpc call was made and on top
    // of that we can assert that the request had a given body
    expect(
      YourUnaryCallRequest.decode(mockRequest.requestMessage).someProperty
    ).toBe('what you expect');

    // from there, you can make assertions directly in the DOM to make sure that
    // whatever was passed in the body of the grpc call is now correctly displayed
    // in your app where it should be, using regular Playwright API
  });
});
```
