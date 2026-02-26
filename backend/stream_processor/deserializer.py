"""Deserialize DynamoDB marshalled attribute values to native Python types."""

import logging

from boto3.dynamodb.types import TypeDeserializer

LOG = logging.getLogger(__name__)

_deserializer = TypeDeserializer()


def deserialize_dynamodb_image(image: dict) -> dict:
    """Deserialize a DynamoDB stream image (marshalled format) to native Python types.

    Handles nested maps (M), lists (L), strings (S), numbers (N),
    booleans (BOOL), and null (NULL).

    Args:
        image: DynamoDB marshalled attribute map, e.g.
               {"job_id": {"S": "abc"}, "count": {"N": "5"}}

    Returns:
        Native Python dict, e.g. {"job_id": "abc", "count": Decimal("5")}
    """
    return {key: _deserializer.deserialize(value) for key, value in image.items()}
