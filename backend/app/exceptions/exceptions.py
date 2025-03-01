from http import HTTPStatus
from typing import Dict
from typing import Optional


class ServiceError(Exception):

    def __init__(self, status_code: int, msg: str):
        """
        Parameters
        ----------
        status_code: int
            Http status code
        msg: str
            Error message
        """
        self.status_code = status_code
        self.msg = msg


class ViewError(Exception):
    """
    Exceptions to this type will be automatically converted to user-visible exceptions.
    Subclasses should overwrite STATUS to specify the HTTP status code of the response.
    """

    STATUS = HTTPStatus.INTERNAL_SERVER_ERROR

    def to_dict(self, request_id: Optional[str] = None) -> Dict[str, str]:
        error_dict = {"code": type(self).__name__, "message": str(self)}
        if request_id:
            error_dict["requestId"] = request_id
        return error_dict


class BadRequestError(ViewError):
    STATUS = HTTPStatus.BAD_REQUEST


class ForbiddenError(ViewError):
    STATUS = HTTPStatus.FORBIDDEN


class NotFoundError(ViewError):
    STATUS = HTTPStatus.NOT_FOUND


class ValidationError(BadRequestError):
    def __init__(self, message: str):
        super().__init__(message)


class UnauthorizedError(ForbiddenError):
    def __init__(self, message: str):
        super().__init__(message)


class InternalError(ViewError):
    STATUS = HTTPStatus.INTERNAL_SERVER_ERROR
