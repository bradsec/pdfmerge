FROM python:3-alpine

RUN adduser -D -H appuser

WORKDIR /app

COPY index.html favicon.ico robots.txt site.webmanifest sitemap.xml ./
COPY css/ css/
COPY js/ js/
COPY fonts/ fonts/
COPY images/ images/

USER appuser

ENV PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1:${PORT}/ || exit 1

CMD python3 -m http.server ${PORT}
