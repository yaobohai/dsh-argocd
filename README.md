# DSH-ArgoCD

A DeepSeek Harness plugin. Connect to one or more Argo CD instances using a username and a saved password to query Applications, resources, and Pods, or to perform synchronization and resource deletion tasks.

Configuration must be set up within DSH under **Settings → ArgoCD Connections**.

## Features


| Tool                               | Purpose                                                      |
| ---------------------------------- | ------------------------------------------------------------ |
| `argocd_login`                     | Re-authenticates using a saved password and returns a session token. |
| `argocd_get_token`                 | Returns a valid (non-expired) session token; automatically re-authenticates if the token has expired. |
| `argocd_list_clusters`             | Lists cluster names, addresses, connection statuses, and versions. (Does not return cluster credentials.) |
| `argocd_list_applications`         | Lists Applications, including their health and synchronization statuses. |
| `argocd_list_application_sync`     | Provides the synchronization and health statuses for all Applications. |
| `argocd_get_application_resources` | Retrieves the resource tree for a specified Application. |
| `argocd_get_application_sync`      | Retrieves the synchronization status of a specified Application. |
| `argocd_get_resource_sync`         | Retrieves the synchronization status for each resource within a specified Application. |
| `argocd_describe_resource`         | Retrieves the live manifest of a specified resource. | Returns only the key names for Secrets |
| `argocd_list_resource_events`      | Kubernetes events for a specified resource |
| `argocd_list_sync_events`          | Sync operations, conditions, and recent sync history for a specified Application |
| `argocd_get_application_pods`      | Pod status (phase, readiness, restart count, image, and requests/limits) |
| `argocd_list_pods`                 | List of Pods |
| `argocd_get_pod_logs`              | Logs for a specified Pod (defaults to the last 200 lines) |
| `argocd_sync_all`                  | Sync all Applications for a given site |
| `argocd_sync_application`          | Sync a specific Application |
| `argocd_delete_resource`           | Delete a resource managed by an Application |


If only one site is configured, or if a default site has been set, the `site` parameter can be omitted. If multiple sites exist and no default is set, specify the `site` using its ID or name.

`argocd_sync_all`, `argocd_sync_application`, and `argocd_delete_resource` will modify the cluster. Setting `prune: true` will remove resources that no longer exist in Git. Setting `dryRun: true` will perform a dry run (simulation) only.

## Installation

The plugin is distributed with a pre-compiled `lib/` directory; there are no `prepare` or `postinstall` scripts in `package.json`. No build scripts are executed during installation, so no script approval prompts will appear.

```bash
dsh plugin --profile web add github:yaobohai/dsh-argocd
```

After installation, restart the corresponding `dsh` process. This package accepts DSH `0.2.1-rc.2` and `0.2.1-rc.3` through `engines.dsh`.

Open **Settings → ArgoCD Connections**. The plugin page does not contain this form.

## Configuration

Go to **Settings → ArgoCD Connections**.

The following connection metadata is stored for each site:

- Site Identifier: Must begin with a lowercase letter; may contain numbers and hyphens; maximum length of 32 characters. The following fields cannot be modified after saving:
- Name
- Argo CD root URL (e.g., `https://argocd.example.com`)
- Username
- Connection timeout (in seconds; range: 1–300)
- Skip TLS certificate verification
- Set as default site

**Test Connection:** Initiates a login attempt using the URL, username, timeout, and TLS settings currently in the form. If a new password is entered, it will be used; otherwise, the previously saved credentials will be used. The result indicates only whether the login was successful and the username used.

## Credentials

Passwords are not stored within the plugin configuration. Each site is assigned a credential reference name—for example, `ARGOCD_PROD_A_PASSWORD` (derived from the site identifier). The UI writes the password to the DSH credential service, while only the reference name is stored in the configuration.

- The password input field is always empty. If a password has already been saved, the placeholder text will read: "Configured; leave blank to keep unchanged."
- Leaving the password field blank when saving preserves the existing password.
- A password must be provided when creating a new site.
- Deleting a site also deletes its associated credentials.
- If the credential is provided via an environment variable and cannot be modified through the UI, the password field will be disabled; the original value remains hidden.
- Passwords are not included in tool parameters. During login or token retrieval, the session token is passed to the model; it is not included in the output of other tools.

## Development

Requires Node.js 22 or later.

```bash
npm install
npm test
```

`npm test` compiles the `src/` directory and copies `client/client.js` to `lib/client.js`. Do not add a `prepare` script, as doing so would trigger an approval requirement during plugin installation.