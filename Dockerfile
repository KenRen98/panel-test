# ============================================================
# 基于官方 pterodactylchina/panel:latest 的自定义镜像
#
# 思路：官方镜像已含编译好的 1.15.0 运行时（PHP8.3 / nginx / supervisord /
#       entrypoint / 已编译前端），我们只需叠加编译后的前端资源
#       （模组包一键安装页 + 侧边栏改版）。
#   好处：不用每次重跑 composer / 装 PHP 扩展 / apk add，构建快、运行时与官方一致。
#   数据库相关保持官方默认，不做任何改动。
# ============================================================

# ---- 阶段 0：编译我们修改过的前端 ----
FROM node:22-alpine AS frontend
WORKDIR /app
COPY . ./
RUN yarn install --frozen-lockfile \
    && yarn run build:production

# ---- 阶段 1：以官方镜像为底座，只叠加前端资源 ----
FROM pterodactylchina/panel:latest

# 覆盖编译后的前端资源（含模组包页面、侧边栏改版、数据库隐藏等）
COPY --from=frontend /app/public/assets ./public/assets

# 官方镜像已声明 ENTRYPOINT / CMD / EXPOSE，此处自动继承，无需重复。
