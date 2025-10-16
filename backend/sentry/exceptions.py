class MissingHeader(Exception):
    def __init__(self, detail: str):
        self.code = 401
        self.detail = detail
        super().__init__(f"{self.code}: {detail}")
