[![smithery badge](https://smithery.ai/badge/@rishipradeep-think41/google-drive-mcp)](https://smithery.ai/server/@rishipradeep-think41/google-drive-mcp)

# Google Drive MCP Server

Google Drive MCP Server is a stateless server that integrates Google Drive functionalities with the Model Context Protocol (MCP). It provides a suite of tools and resources to interact with Google Drive, enabling operations like file management, content retrieval, and permission handling through a standardized interface.

🚀 **Features**

* **Drive Roots Listing:** Retrieve files from "My Drive" and "Shared with me" sections.
* **Folder Contents:** List all items within a specified folder.
* **File Metadata Retrieval:** Access detailed metadata of files.
* **Content Exporting:** Export Google Docs, Sheets, and Slides to formats like Markdown, CSV, or plain text.
* **File Upload & Update:** Upload new files or update existing ones with base64-encoded content.
* **Text Appending:** Append plain text to existing text files.
* **File Deletion:** Trash or permanently delete files.
* **Permission Management:** Share files with specific users, groups, domains, or publicly.
* **Commenting:** Add comments to files.
* **Change Tracking:** Monitor changes in Drive using change tokens.
* **File Searching:** Search for files based on name substrings.

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

* `drive_roots`: Lists files in "My Drive" and "Shared with me".

**Tools**

* `drive_folder_children`: Lists contents of a specified folder.
* `drive_file_metadata`: Retrieves metadata for a given file ID.
* `drive_file_content`: Retrieves or exports file content based on MIME type.
* `drive_search`: Searches for files by name substring.
* `drive_changes`: Lists changes in Drive since a given token.
* `drive_mcp_info`: Provides MCP discovery information.
* `drive_create`: Creates a new file or folder.
* `drive_upload`: Uploads a new file or updates an existing one with base64-encoded content.
* `drive_append_text`: Appends plain text to an existing text file.
* `drive_delete`: Trashes or permanently deletes a file.
* `drive_share`: Manages file permissions.
* `drive_comment`: Adds a comment to a file.

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

***
