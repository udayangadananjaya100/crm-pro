FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies needed for native modules (like bcrypt, better-sqlite3)
RUN apk add --no-cache python3 make g++ 

# Copy package.json and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Create data and logs directories for volumes
RUN mkdir -p data logs

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
