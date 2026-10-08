# ============================================================
# 基于官方 pterodactylchina/panel:latest 的自定义镜像
#
# 思路：官方镜像已含编译好的 1.15.0 运行时（PHP8.3 / nginx / supervisord /
#       entrypoint / 已编译前端），我们只需叠加自己的修改：
#        1) 覆盖编译后的前端资源（模组包一键安装页 + 侧边栏改版）
#        2) 关闭迁移时 mysql 客户端的 SSL 要求（兼容内置无 SSL 的 MariaDB）
#   好处：不用每次重跑 composer / 装 PHP 扩展 / apk add，构建快、运行时与官方一致。
# ============================================================

# ---- 阶段 0：编译我们修改过的前端 ----
FROM node:22-alpine AS frontend
WORKDIR /app
COPY . ./
RUN yarn install --frozen-lockfile \
    && yarn run build:production

# ---- 阶段 1：以官方镜像为底座，只叠加我们的修改 ----
FROM pterodactylchina/panel:latest

# 1) 覆盖编译后的前端资源（含模组包页面、侧边栏改版、数据库隐藏等）
COPY --from=frontend /app/public/assets ./public/assets

# 2) 迁移时 mysql 客户端不强制 SSL：
#    官方镜像内置的 mysql 客户端在 schema 导入时会要求 SSL，而搭配内置 MariaDB
#    （默认无 SSL）会报 "SSL is required, but the server does not support it"。
#    写入 /root/.my.cnf（entrypoint 以 root 运行，mysql 客户端读取它）强制关闭 SSL。
RUN mkdir -p /root \
    && printf '[client]\nssl-mode=DISABLED\nssl=0\n' > /root/.my.cnf

# 官方镜像已声明 ENTRYPOINT / CMD / EXPOSE，此处自动继承，无需重复。
