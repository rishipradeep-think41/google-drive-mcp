[![smithery badge](https://smithery.ai/badge/@rishipradeep-think41/google-drive-mcp)](https://smithery.ai/server/@rishipradeep-think41/google-drive-mcp)

# Google Drive MCP Server

Google Drive MCP Server is a stateless server that integrates Google Drive functionalities with the Model Context Protocol (MCP). It provides a suite of tools and resources to interact with Google Drive, enabling operations like file management, content retrieval, and permission handling through a standardized interface.

## 🚀 Features

- **Root Listing:** List top-level locations like "My Drive" and "Shared with me" using `drive_roots`.
- **Folder Browsing:** List contents of any folder with `drive_folder_children`.
- **File Metadata:** Retrieve detailed metadata for a file using `drive_file_metadata`.
- **File Exporting:** Retrieve raw file content using `drive_file_content` (note: no built-in format conversion).
- **File Uploading:** Create or update files with content using `drive_upload`.
- **Text Appending:** Append plain text to existing text files using `drive_append_text`.
- **File Deletion & Trash:** Move files to trash or delete them permanently with `drive_delete` and `drive_file_empty_trash`.
- **Permission Management:** Add, update, remove, or list permissions for files/folders via `drive_share`, `drive_permission_update`, `drive_permission_delete`, etc.
- **Commenting & Replies:** Add comments, reply to them, and list/delete comments or replies using tools like `drive_comment`, `drive_file_list_comments`, and related tools.
- **Change Tracking:** Track changes in a user's Drive using `drive_changes`.
- **File Search:** Search for files by name or other criteria using `drive_search`.

🛠️ **Installation**

1.  **Clone the Repository:**

    ```bash
    git clone [https://github.com/rishipradeep-think41/google-drive-mcp.git](https://github.com/rishipradeep-think41/google-drive-mcp.git)
    cd google-drive-mcp
    ```

2.  **Install Dependencies:**

    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the root directory and add the following:

    ```env
    CLIENT_ID=your_google_client_id
    CLIENT_SECRET=your_google_client_secret
    REFRESH_TOKEN=your_google_refresh_token
    PORT=8081
    ```

    Ensure you have a valid Google OAuth2 client and refresh token with appropriate Drive API scopes.

4.  **Start the Server:**
    ```bash
    node index.js
    ```
    The server will start on `http://localhost:8081`.

📚 **API Overview**

**Resources**

- `drive_roots`: Lists files in "My Drive" and "Shared with me".

## Tool Categories

### Basic Navigation & Information

| Tool Name                 | Description                                |
| ------------------------- | ------------------------------------------ |
| `drive_roots`             | List roots (My Drive, Shared with me)      |
| `drive_changes`           | List changes in Drive                      |
| `drive_file_metadata`     | Get metadata of a file                     |
| `drive_folder_children`   | List contents of a folder                  |
| `drive_search`            | Search files in Google Drive               |
| `drive_storage_quota`     | Get storage quota information for the user |
| `drive_storage_breakdown` | Get storage usage breakdown by file type   |

### File Content Operations

| Tool Name            | Description                                         |
| -------------------- | --------------------------------------------------- |
| `drive_file_content` | Retrieve content of a Google Drive file             |
| `drive_create`       | Create file or folder                               |
| `drive_upload`       | Upload or update file content                       |
| `drive_append_text`  | Append plain text to an existing text file in Drive |

### File Management

| Tool Name                | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `drive_copy`             | Copy a file or folder to a new location            |
| `drive_move`             | Move a file or folder to a different parent folder |
| `drive_rename`           | Rename a file or folder                            |
| `drive_delete`           | Trash or delete a file                             |
| `drive_restore`          | Restore a file from the trash                      |
| `drive_file_empty_trash` | Permanently delete all trashed files               |
| `drive_star`             | Star or unstar a file or folder                    |
| `drive_file_lock`        | Lock or unlock a file to prevent changes           |
| `drive_shortcut_create`  | Create a shortcut to a file or folder              |

### File Version Management

| Tool Name               | Description                         |
| ----------------------- | ----------------------------------- |
| `drive_versions_list`   | List all versions of a file         |
| `drive_versions_delete` | Delete a specific version of a file |

### Permissions & Sharing

| Tool Name                     | Description                                           |
| ----------------------------- | ----------------------------------------------------- |
| `drive_share`                 | Manage file permissions                               |
| `drive_permissions_list`      | List all permissions of a file or folder              |
| `drive_permission_update`     | Update a user's permission on a file or folder        |
| `drive_permission_delete`     | Remove a user's access from a file or folder          |
| `drive_permission_add_domain` | Share file or folder with everyone in a domain        |
| `drive_permission_add_anyone` | Allow anyone with the link to access a file or folder |

### Comments & Collaboration

| Tool Name                     | Description                   |
| ----------------------------- | ----------------------------- |
| `drive_comment`               | Add a comment to a file       |
| `drive_file_list_comments`    | List all comments on a file   |
| `drive_file_delete_comment`   | Delete a comment from a file  |
| `drive_file_reply_to_comment` | Reply to a comment on a file  |
| `drive_file_list_replies`     | List all replies to a comment |
| `drive_file_delete_reply`     | Delete a reply to a comment   |

### Shared Drives (Team Drives)

| Tool Name                   | Description                              |
| --------------------------- | ---------------------------------------- |
| `drive_shared_drives_list`  | List all accessible Shared Drives        |
| `drive_shared_drive_get`    | Get metadata for a specific Shared Drive |
| `drive_shared_drive_create` | Create a new Shared Drive                |
| `drive_shared_drive_delete` | Delete a Shared Drive                    |
| `drive_shared_drive_update` | Update a Shared Drive's metadata         |
| `drive_shared_drive_files`  | List files in a Shared Drive             |

### Batch Operations

| Tool Name                        | Description                                         |
| -------------------------------- | --------------------------------------------------- |
| `drive_batch_get_metadata`       | Get metadata for multiple files in a single request |
| `drive_batch_update_permissions` | Update permissions for multiple files at once       |
| `drive_batch_delete`             | Delete multiple files or folders at once            |
| `drive_batch_copy`               | Copy multiple files to a destination folder         |
| `drive_batch_move`               | Move multiple files to a destination folder         |

🔐 **Authentication**

The server uses OAuth2 for authentication with Google Drive. Ensure that the `CLIENT_ID`, `CLIENT_SECRET`, and `REFRESH_TOKEN` are correctly set in the `.env` file. These credentials should have the necessary scopes to access and modify files in Google Drive.

🧪 **Testing**

You can test the endpoints using tools like MCPInspector. Ensure the server is running at `http://localhost:${port}`.

🤝 **Contributing**

Contributions are welcome! Please fork the repository and submit a pull request for any enhancements or bug fixes.

📄 **License**

This project is licensed under the [MIT License](LICENSE).

📧 **Contact**

For any questions or feedback, please open an issue on the [GitHub repository](https://github.com/rishipradeep-think41/google-drive-mcp).

---
