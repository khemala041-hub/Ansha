# ================================================================
# Ansha Shine Kids School — ERP System
# Docker image using nginx:alpine (lightweight ~25MB)
# ================================================================

FROM nginx:alpine

LABEL maintainer="Ansha Shine Kids School <admin@anshashinekidsschool.com>"
LABEL description="School ERP — Student, Staff, Fees, Attendance, CCTV, Transport"
LABEL version="1.0"

# Remove default nginx static content
RUN rm -rf /usr/share/nginx/html/*

# Copy ERP application files
COPY . /usr/share/nginx/html/

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Remove server files not needed in container
RUN rm -f /usr/share/nginx/html/server.pl \
          /usr/share/nginx/html/START\ ERP.bat \
          /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/nginx.conf \
          /usr/share/nginx/html/.dockerignore

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost/index.html || exit 1

CMD ["nginx", "-g", "daemon off;"]
