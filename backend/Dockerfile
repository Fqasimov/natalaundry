# Nata Laundry API.
#
# FrankenPHP rather than php-fpm + nginx: one process, production-grade, and
# no supervisor to babysit two daemons in a container. Any host that takes a
# Dockerfile (Railway, Render, Fly, Cloud Run, a plain VPS) can run this.
FROM dunglas/frankenphp:php8.3

# pdo_pgsql is the only extension this app needs beyond the defaults — the
# database is the same Supabase Postgres the mobile app reads.
RUN install-php-extensions pdo_pgsql pgsql opcache

WORKDIR /app

# Composer first, so a code change does not invalidate the dependency layer.
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

COPY . .
RUN composer dump-autoload --optimize --classmap-authoritative \
 && php artisan package:discover --ansi

# Config and routes are cached at build time. Views are not: the admin console
# is a single Blade file and caching it buys nothing.
RUN php artisan config:cache && php artisan route:cache

# Laravel needs these writable. The app is otherwise stateless — sessions are
# cookies, the queue is sync, the cache is files — so nothing here needs to
# survive a redeploy.
RUN chmod -R ug+rw storage bootstrap/cache

ENV SERVER_NAME=:8080
EXPOSE 8080

# /up is Laravel's built-in health endpoint and touches no database, so a host
# health check cannot be knocked over by Postgres being slow.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fsS http://127.0.0.1:8080/up || exit 1
