import { ApiErrorBody } from "../types.ts";

// api error handler
export class ApiError extends Error {
    readonly status: number
    readonly body?: ApiErrorBody

    constructor(message: string, status: number, body?: ApiErrorBody) {
        super(message)
        this.name = "ApiError"
        this.status = status
        this.body = body
    }
}
