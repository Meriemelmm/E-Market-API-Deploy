FROM node:24-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy dependency manifests first (for better caching)
COPY package*.json ./


RUN npm install 

# Copy application source
COPY . .

# Expose the application port
EXPOSE 3002

# Start the app
CMD ["npm", "start"]