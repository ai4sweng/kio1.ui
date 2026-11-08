FROM nginx:1.28-alpine

ENV KIO1_API_URL=http://kio1:5000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY templates/index.html /usr/share/nginx/html/index.html
COPY static/ /usr/share/nginx/html/static/
RUN chown -R nginx:nginx /etc/nginx/conf.d /usr/share/nginx/html /var/cache/nginx /var/log/nginx \
    && touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1