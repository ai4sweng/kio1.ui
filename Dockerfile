FROM nginx:1.28-alpine

ENV KIO1_API_URL=http://kio1:5000
COPY --chmod=0644 nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=0644 templates/index.html /usr/share/nginx/html/index.html
COPY static/ /usr/share/nginx/html/static/
RUN chmod 0755 /etc/nginx/templates /usr/share/nginx/html \
    && chmod -R u=rwX,go=rX /usr/share/nginx/html/static \
    && chown -R nginx:nginx /etc/nginx/conf.d /var/cache/nginx /var/log/nginx \
    && touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1