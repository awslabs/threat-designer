FROM public.ecr.aws/docker/library/python:3.12-slim
WORKDIR /app

# Define build argument with default value
ARG AWS_REGION=us-east-1

COPY requirements.txt requirements.txt
# Install from requirements file
RUN pip install -r requirements.txt


# Set AWS region environment variable using the build arg
ENV AWS_REGION=${AWS_REGION}
ENV AWS_DEFAULT_REGION=${AWS_REGION}

# Signal that this is running in Docker for host binding logic
ENV DOCKER_CONTAINER=1

# Create non-root user
RUN useradd -m -u 1000 bedrock_agentcore
USER bedrock_agentcore

EXPOSE 8080
EXPOSE 8000

COPY . .

# Use the full module path
CMD ["python", "-m", "agent"]