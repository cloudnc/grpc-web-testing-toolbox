import { Request } from "playwright-core";
import { unframeRequest } from "../base";

export function readGrpcRequest(request: Request): Uint8Array | null {
  const requestBody = request.postDataBuffer();
  return !requestBody ? null : unframeRequest(requestBody);
}
