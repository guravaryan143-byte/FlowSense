"""Domain errors. Services raise these; main.py turns them into HTTP responses."""


class DomainError(Exception):
    status_code = 400
    code = "domain_error"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFoundError(DomainError):
    status_code = 404
    code = "not_found"


class ConflictError(DomainError):
    status_code = 409
    code = "conflict"


class ValidationFailed(DomainError):
    status_code = 422
    code = "validation_failed"


class ModelNotTrainedError(DomainError):
    status_code = 503
    code = "model_not_trained"


class NoRouteError(DomainError):
    status_code = 404
    code = "no_route"


class AuthError(DomainError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(DomainError):
    status_code = 403
    code = "forbidden"


class TooManyRequests(DomainError):
    status_code = 429
    code = "too_many_requests"
