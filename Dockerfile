FROM oven/bun:latest

# Set the working directory
WORKDIR /app

# Ensure the bun user owns the application directory
RUN chown -R bun:bun /app

# Switch to the bun user
USER bun

CMD ["sleep", "infinity"]