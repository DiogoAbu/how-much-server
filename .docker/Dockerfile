FROM postgres:13-alpine

ENV POSTGRES_USER postgres
ENV POSTGRES_PASSWORD password
ENV POSTGRES_DB howmuch

COPY init.sql /docker-entrypoint-initdb.d/
