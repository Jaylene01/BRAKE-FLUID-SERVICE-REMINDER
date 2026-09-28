# WEIDE 刹车油保养提醒 —— Railway 云端数据库版

跟保修卡系统（warranty-card-01）同一套架构：Express + Postgres，记录存在云端，
手机、电脑任何设备打开都是同一份记录。

## 跟保修卡的不同

- 卡面：BRAKE FLUID SERVICE REMINDER，显示本次保养日期、下次保养日期、下次保养里程
- 背面：刹车油型号、更换周期（月 / KM）、保养须知、WhatsApp
- 状态：正常 / 即将到期（30 天内）/ 需更换（已过期）
- 数据表：`brake_fluid_services`（跟保修卡的 `warranty_cards` 分开，不会互相影响）

## 部署到 Railway

1. 新建一个 GitHub 仓库，把整个文件夹传上去
2. Railway 新建 Project → **+ New → Database → PostgreSQL**
3. **+ New → GitHub Repo** → 选这个仓库，Settings 里 **Root Directory** 设成 `server`
4. Variables：Add Reference 选 Postgres 的 `DATABASE_URL`；
   可选加 `APP_USERNAME` / `APP_PASSWORD` 开启登录密码
5. Settings → Networking → **Generate Domain** 拿到网址
