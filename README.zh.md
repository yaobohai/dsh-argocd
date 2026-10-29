# dsh-argocd

DeepSeek Harness 插件。用用户名和已保存的密码连接一个或多个 Argo CD 站点，查询 Application、资源和 Pod，并执行同步或删除资源。

配置需要在DSH的**设置 → ArgoCD连接中配置**

## 功能


| 工具                                 | 作用                                  |
| ---------------------------------- | ----------------------------------- |
| `argocd_login`                     | 用已保存的密码重新登录，返回会话 token              |
| `argocd_get_token`                 | 返回未过期的会话 token；过期后自动重新登录            |
| `argocd_list_clusters`             | 集群名称、地址、连接状态和版本。不返回集群凭据             |
| `argocd_list_applications`         | Application 列表，含健康状态和同步状态           |
| `argocd_list_application_sync`     | 全部 Application 的同步状态和健康状态           |
| `argocd_get_application_resources` | 指定 Application 的资源树                 |
| `argocd_get_application_sync`      | 指定 Application 的同步状态                |
| `argocd_get_resource_sync`         | 指定 Application 下每个资源的同步状态           |
| `argocd_describe_resource`         | 指定资源的实时清单。Secret 只返回键名              |
| `argocd_list_resource_events`      | 指定资源的 Kubernetes 事件                 |
| `argocd_list_sync_events`          | 指定 Application 的同步操作、条件和最近同步历史      |
| `argocd_get_application_pods`      | Pod 的阶段、就绪、重启次数、镜像和 requests/limits |
| `argocd_list_pods`                 | Pod 列表                              |
| `argocd_get_pod_logs`              | 指定 Pod 的日志，默认最近 200 行               |
| `argocd_sync_all`                  | 同步该站点的全部 Application                |
| `argocd_sync_application`          | 同步一个 Application                    |
| `argocd_delete_resource`           | 删除一个 Application 管理的资源              |


只配置了一个站点，或已经设置默认站点时，工具可以省略 `site`。有多个站点且没有默认站点时，用站点 id 或名称指定 `site`。

`argocd_sync_all`、`argocd_sync_application` 和 `argocd_delete_resource` 会改变集群。`prune: true` 会删除 Git 里已经不存在的资源。`dryRun: true` 只预演。

## 安装

插件发布的是已经编译好的 `lib/`，`package.json` 里没有 `prepare` 或 `postinstall`。安装时不需要执行构建脚本，因此不会弹出脚本审批。

```bash
dsh plugin --profile web add github:yaobohai/dsh-argocd
```

安装后重启对应的 `dsh` 进程

## 配置

打开 **设置 → ArgoCD连接**。

每个站点保存这些连接元数据：

- 站点标识：小写字母开头，可含数字和连字符，最长 32 个字符。保存后不能修改
- 名称
- Argo CD 根地址，例如 `https://argocd.example.com`
- 用户名
- 连接超时，页面上按秒填写，范围 1 到 300 秒
- 是否跳过 TLS 证书校验
- 是否作为默认站点

**测试连接** 用当前表单里的地址、用户名、超时和 TLS 选项发起一次登录。输入框里有新密码时用这份密码；留空时用已经保存的凭据。结果只显示是否成功和登录用户名

## 凭据

密码不在插件配置里。每个站点有一个凭据引用名，形如 `ARGOCD_PROD_A_PASSWORD`（由站点标识派生）。页面把密码写入 DSH 凭据服务，配置里只保存这个名字。

- 密码输入框始终是空的。已保存时占位文字是「已配置，留空则保持不变」
- 保存时密码框留空，会保留原来的密码
- 新建站点必须填写密码
- 删除站点时会同时删除对应凭据
- 引用由环境变量提供、页面不能改写时，密码框会禁用，页面仍然不显示原值
- 工具参数里没有密码。登录和获取 token 会把会话 token 交给模型；其他工具的结果里不含 token



## 开发

需要 Node.js 22 或更新版本。

```bash
npm install
npm test
```

`npm test` 会编译 `src/` 并把 `client/client.js` 复制到 `lib/client.js`。不要添加 `prepare` 脚本，否则安装插件时会要求审批。