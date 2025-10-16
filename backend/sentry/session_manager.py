from typing import Dict, Optional
import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException
from config import sync_checkpointer
from utils import logger
import os


TABLE_NAME = os.environ.get("SESSION_TABLE", "sentry-sessions-table")
REGION = os.environ.get("REGION", "us-east-1")


class SessionManager:
    def __init__(
        self,
    ):
        self.session_cache: Dict[str, str] = {}
        self.table_name = TABLE_NAME
        self.dynamodb = boto3.resource("dynamodb", region_name=REGION)
        self.table = self.dynamodb.Table(TABLE_NAME)

        # Initialize cache from DynamoDB on startup
        self._load_cache_from_dynamodb()

    def _load_cache_from_dynamodb(self):
        """Load existing session mappings from DynamoDB into local cache"""
        try:
            response = self.table.scan()
            for item in response["Items"]:
                session_header = item["session_header"]
                session_id = item["session_id"]
                self.session_cache[session_header] = session_id

            logger.info(
                f"Loaded {len(self.session_cache)} session mappings from DynamoDB"
            )

        except ClientError as e:
            logger.warning(f"Could not load session mappings from DynamoDB: {e}")
        except Exception as e:
            logger.error(f"Unexpected error loading from DynamoDB: {e}")

    def _get_session_from_dynamodb(self, session_header: str) -> Optional[str]:
        """Retrieve session ID from DynamoDB for the given header"""
        try:
            response = self.table.get_item(Key={"session_header": session_header})

            if "Item" in response:
                session_id = response["Item"]["session_id"]
                # Update local cache
                self.session_cache[session_header] = session_id
                logger.info(
                    f"Retrieved session ID from DynamoDB for header: {session_header}"
                )
                return session_id

        except ClientError as e:
            logger.error(f"Error retrieving session from DynamoDB: {e}")
        except Exception as e:
            logger.error(f"Unexpected error retrieving from DynamoDB: {e}")

        return None

    def _save_session_to_dynamodb(self, session_header: str, session_id: str):
        """Save session mapping to DynamoDB"""
        try:
            self.table.put_item(
                Item={
                    "session_header": session_header,
                    "session_id": session_id,
                    "created_at": int(__import__("time").time()),
                }
            )
            logger.info(
                f"Saved session mapping to DynamoDB: {session_header} -> {session_id}"
            )

        except ClientError as e:
            logger.error(f"Error saving session to DynamoDB: {e}")
            # Don't raise exception here - local cache still works
        except Exception as e:
            logger.error(f"Unexpected error saving to DynamoDB: {e}")

    def get_or_create_session_id(self, session_header: str) -> str:
        """
        Get existing session ID for the given header or create a new one.
        Checks local cache first, then DynamoDB, then creates new session.
        Saves to both cache and DynamoDB.
        """
        # Check local cache first (fastest)
        if session_header in self.session_cache:
            logger.info(
                f"Found existing session ID in cache for header: {session_header}"
            )
            return self.session_cache[session_header]

        # Check DynamoDB if not in local cache
        session_id = self._get_session_from_dynamodb(session_header)
        if session_id:
            return session_id

        # Create new session if not found anywhere
        try:
            new_session = sync_checkpointer.session_client.create_session()
            session_id = new_session.session_id

            # Save to both local cache and DynamoDB
            self.session_cache[session_header] = session_id
            self._save_session_to_dynamodb(session_header, session_id)

            logger.info(
                f"Created new session ID {session_id} for header: {session_header}"
            )
            return session_id

        except Exception as e:
            logger.error(f"Failed to create session for header {session_header}: {e}")
            raise HTTPException(status_code=500, detail="Failed to create session")

    def clear_cache(self):
        """Clear the local session cache (DynamoDB data remains)"""
        self.session_cache.clear()
        logger.info("Cleared local session cache")

    def delete_session(self, session_header: str):
        """Delete a specific session mapping from both cache and DynamoDB"""
        # Remove from local cache
        self.clear_cache()
        logger.info(f"Session Cache: {self.session_cache}")

        # Remove from DynamoDB
        try:
            self.table.delete_item(Key={"session_header": session_header})
            logger.info(f"Deleted session mapping for header: {session_header}")

        except ClientError as e:
            logger.error(f"Error deleting session from DynamoDB: {e}")
        except Exception as e:
            logger.error(f"Unexpected error deleting from DynamoDB: {e}")


# Global session manager instance
session_manager = SessionManager()
