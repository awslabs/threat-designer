from pydantic import BaseModel
from typing import Dict, Any


class InvocationRequest(BaseModel):
    input: Dict[str, Any]
