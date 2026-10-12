#!/bin/ash -e
cd /app

mkdir -p /var/log/panel/logs/ /var/log/supervisord/ /var/log/nginx/ /var/log/php7/ \
  && chmod 777 /var/log/panel/logs/ \
  && ln -s /app/storage/logs/ /var/log/panel/

## 检查 .env 文件并在缺少时生成应用程序密钥
if [ -f /app/var/.env ]; then
  echo "存在外部变量."
  rm -rf /app/.env
  ln -s /app/var/.env /app/
else
  echo "不存在外部变量."
  rm -rf /app/.env
  touch /app/var/.env

  ## 由于 key generate --force 失败，手动生成密钥
  if [ -z $APP_KEY ]; then
     echo -e "生成密钥."
     APP_KEY=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
     echo -e "生成的应用程序密钥：$APP_KEY"
     echo -e "APP_KEY=$APP_KEY" > /app/var/.env
  else
    echo -e "APP_KEY 存在于环境中，已使用它."
    echo -e "APP_KEY=$APP_KEY" > /app/var/.env
  fi

  ## 如果未提供，则为哈希 ID 生成随机盐值。
  if [ -z $HASHIDS_SALT ]; then
     echo -e "生成哈希值盐。"
     HASHIDS_SALT=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9!@#$%^&*()_+?><~' | fold -w 20 | head -n 1)
     echo -e "生成的哈希值盐: $HASHIDS_SALT"
     echo -e "HASHIDS_SALT=$HASHIDS_SALT" >> /app/var/.env
  else
    echo -e "使用在环境中的 HASHIDS_SALT 值。"
    echo -e "HASHIDS_SALT=$HASHIDS_SALT" >> /app/var/.env
  fi

  ln -s /app/var/.env /app/
fi

echo "正在检查是否需要 https."
DOMAIN=$(echo $APP_URL | sed 's~http[s]*://~~g')
if [ -f /etc/nginx/http.d/panel.conf ]; then
  echo "nginx 配置已经就位."
else
  echo "正在检查是否设置了 letsencrypt 电子邮箱."
  if [ -z $LE_EMAIL ]; then
    echo "http 配置文件中没有设置 letsencrypt 电子邮箱."
    cp .github/docker/default.conf /etc/nginx/http.d/panel.conf
  else
    echo "编写 ssl 配置"
    cp .github/docker/default_ssl.conf /etc/nginx/http.d/panel.conf
    echo "正在更新域名的 ssl 配置"
    sed -i "s|<domain>|$DOMAIN|g" /etc/nginx/http.d/panel.conf
  fi
  echo "删除默认的 nginx 配置"
  rm -rf /etc/nginx/http.d/default.conf
fi

## 证书检查（certbot 已移除；证书由宿主机签发并映射进容器）
if [ -n "$LE_EMAIL" ]; then
  echo "正在检查 SSL 证书."
  CERT_FILE="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
  KEY_FILE="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
  CERT_OK="no"
  KEY_OK="no"
  if [ -f "$CERT_FILE" ]; then
    echo "[证书检查] 证书文件已找到：$CERT_FILE"
    CERT_OK="yes"
  else
    echo "[证书检查] 警告：未找到证书文件：$CERT_FILE"
  fi
  if [ -f "$KEY_FILE" ]; then
    echo "[证书检查] 私钥文件已找到：$KEY_FILE"
    KEY_OK="yes"
  else
    echo "[证书检查] 警告：未找到私钥文件：$KEY_FILE"
  fi
  if [ "$CERT_OK" = "yes" ] && [ "$KEY_OK" = "yes" ]; then
    if command -v openssl >/dev/null 2>&1; then
      if openssl x509 -checkend 604800 -noout -in "$CERT_FILE" >/dev/null 2>&1; then
        echo "[证书检查] 证书有效（剩余有效期超过 7 天）。"
      else
        EXPIRES=$(openssl x509 -enddate -noout -in "$CERT_FILE" 2>/dev/null | cut -d= -f2-)
        echo "[证书检查] 警告：证书将在 7 天内过期或已经过期！"
        [ -n "$EXPIRES" ] && echo "[证书检查]   过期时间：$EXPIRES"
      fi
    fi
  else
    echo "[证书检查] 警告：证书或私钥缺失，请将宿主机签发的证书映射到 /etc/letsencrypt/live/$DOMAIN/ 目录下（fullchain.pem + privkey.pem）。"
  fi
fi

if [[ -z $DB_PORT ]]; then
  echo -e "未指定 DB_PORT，默认为 3306"
  DB_PORT=3306
fi

## 检查日志文件夹权限
echo "修复日志文件夹权限。"
if [ "$(stat -c %U:%G /app/storage/logs)" != "nginx" ]; then
  echo "修复日志文件夹权限。"
  chown -R nginx: /app/storage/logs/
fi

## 在启动面板之前检查数据库
echo "正在检查数据库状态。"
until nc -z -v -w30 $DB_HOST $DB_PORT
do
  echo "正在等待数据库连接..."
  # 等待 1 秒再检查
  sleep 1
done

## 确保数据库已设置
echo -e "迁移或生成数据库"
php artisan migrate --seed --force

## 启动队列的 cronjobs
echo -e "正在启动 cron 作业."
crond -L /var/log/crond -l 5

echo -e "正在启动 supervisord."
exec "$@"
