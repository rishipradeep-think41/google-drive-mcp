import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createStatelessServer } from "@smithery/sdk/server/stateless.js";
import * as dotenv from "dotenv";
import { join } from "path";
import { google } from "googleapis";
import { z } from "zod";
import { Console } from "console";

dotenv.config({ path: join(process.cwd(), ".env") });

function createMcpServer({ config }) {
  const CLIENT_ID = config?.CLIENT_ID || process.env.CLIENT_ID;
  const CLIENT_SECRET = config?.CLIENT_SECRET || process.env.CLIENT_SECRET;
  const REFRESH_TOKEN = config?.REFRESH_TOKEN || process.env.REFRESH_TOKEN;

  const server = new McpServer(
    { name: "google-drive-server", version: "0.2.0" },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // set up Google Drive client
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  auth.setCredentials({ refresh_token: REFRESH_TOKEN });
  const drive = google.drive({ version: "v3", auth });

  // ----- RESOURCES (read-only) -----

  // List roots (My Drive, Shared with me)
  server.resource(
    "drive_roots",
    "http://localhost:8081/mcp/driveroots",
    z.object({}),
    async () => {
      const myDrive = await drive.files.list({
        q: "'me' in owners and trashed=false and 'root' in parents",
        fields: "files(id, name)",
      });

      const shared = await drive.files.list({
        q: "sharedWithMe and trashed=false",
        fields: "files(id, name)",
      });

      return {
        contents: [
          {
            uri: "drive://mydrive",
            text: JSON.stringify(myDrive.data.files, null, 2),
          },
          {
            uri: "drive://sharedwithme",
            text: JSON.stringify(shared.data.files, null, 2),
          },
        ],
      };
    }
  );

  // ----- TOOLS (write) -----

  // Change feed
  server.tool(
    "drive_changes",
    "List changes in Drive",
    {
      startPageToken: z
        .string()
        .describe("Token to start listing changes from"),
    },
    async ({ startPageToken }) => {
      const res = await drive.changes.list({
        pageToken: startPageToken,
        fields: "newStartPageToken, changes(fileId, removed, file)",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2),
          },
        ],
      };
    }
  );

  // File Metadata
  server.tool(
    "drive_file_metadata",
    "Get metadata of a file",
    {
      fileId: z.string().describe("ID of the file to retrieve metadata for"),
    },
    async ({ fileId }) => {
      const res = await drive.files.get({
        fileId,
        fields: "id, name, mimeType, size, createdTime, modifiedTime, owners",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2),
          },
        ],
      };
    }
  );

  // Folder children listing
  server.tool(
    "drive_folder_children",
    "List contents of a folder",
    {
      folderId: z.string().describe("ID of the folder to list contents of"),
      pageToken: z.string().optional().describe("Token for pagination"),
      pageSize: z.number().optional().describe("Number of results to return"),
    },
    async ({ folderId, pageToken, pageSize }) => {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        pageToken,
        pageSize: pageSize || 50,
        fields: "nextPageToken, files(id, name, mimeType)",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "drive_search",
    "Search files in Google Drive",
    {
      query: z.string().describe("Query string to search files"),
      pageToken: z.string().optional().describe("Pagination token"),
      pageSize: z.number().optional().describe("Number of items to return"),
    },
    async ({ query, pageToken, pageSize }) => {
      const userQuery = query.trim();
      let searchQuery = "";
      if (!userQuery) {
        searchQuery = "trashed = false";
      } else {
        const escapedQuery = userQuery
          .replace(/\\/g, "\\\\")
          .replace(/'/g, "\\'");
        const conditions = [];
        conditions.push(`name contains '${escapedQuery}'`);
        searchQuery = `(${conditions.join(" or ")}) and trashed = false`;
      }

      const res = await drive.files.list({
        q: searchQuery,
        pageToken,
        pageSize: pageSize || 20,
        fields: "nextPageToken, files(id, name, mimeType)",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "drive_file_content",
    "Retrieve content of a Google Drive file",
    {
      fileId: z.string().describe("ID of the file to retrieve content from"),
    },
    async ({ fileId }) => {
      const meta = await drive.files.get({ fileId, fields: "mimeType, name" });
      const mime = meta.data.mimeType;
      const fileName = meta.data.name || fileId;

      if (mime?.startsWith("application/vnd.google-apps")) {
        let exportType = "text/plain";
        if (mime === "application/vnd.google-apps.document")
          exportType = "text/markdown";
        if (mime === "application/vnd.google-apps.spreadsheet")
          exportType = "text/csv";
        if (mime === "application/vnd.google-apps.presentation")
          exportType = "text/plain";

        const exported = await drive.files.export(
          { fileId, mimeType: exportType },
          { responseType: "text" }
        );

        return {
          content: [
            {
              type: "text",
              text: exported.data,
            },
          ],
        };
      }

      const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "arraybuffer" }
      );
      const buf = Buffer.from(res.data);
      const isText = mime?.startsWith("text/") || mime === "application/json";

      return {
        content: [
          {
            type: isText ? "text" : "blob",
            text: isText ? buf.toString("utf-8") : buf.toString("base64"),
          },
        ],
      };
    }
  );

  server.tool(
    "drive_create",
    "Create file or folder",
    {
      name: z.string().describe("Name of the file or folder"),
      mimeType: z.string().describe("MIME type of the file/folder"),
      parents: z.array(z.string()).optional().describe("Parent folder IDs"),
    },
    async ({ name, mimeType, parents }) => {
      const res = await drive.files.create({
        requestBody: { name, mimeType, parents },
      });
      return { content: [{ type: "text", text: `Created ${res.data.id}` }] };
    }
  );

  server.tool(
    "drive_upload",
    "Upload or update file content",
    {
      fileId: z.string().optional().describe("ID of the file to update"),
      data: z.string().describe("Base64 encoded data"),
      mimeType: z.string().optional().describe("MIME type of the data"),
    },
    async ({ fileId, data, mimeType }) => {
      const buf = Buffer.from(data, "base64");
      const media = { mimeType, body: buf };
      if (fileId) {
        await drive.files.update({ fileId, media });
        return { content: [{ type: "text", text: `Updated ${fileId}` }] };
      }
      const res = await drive.files.create({
        requestBody: { mimeType },
        media,
      });
      return { content: [{ type: "text", text: `Uploaded ${res.data.id}` }] };
    }
  );

  server.tool(
    "drive_append_text",
    "Append plain text to an existing text file in Drive",
    {
      fileId: z.string().describe("ID of the file to append to"),
      text: z.string().describe("Text to append to the file"),
    },
    async ({ fileId, text }) => {
      // Step 1: Download current content
      const meta = await drive.files.get({ fileId, fields: "mimeType" });
      // if (!meta.data.mimeType?.startsWith("text/")) {
      //   throw new Error("Only text/* MIME type files can be appended to.");
      // }

      const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "arraybuffer" }
      );
      const current = Buffer.from(res.data).toString("utf-8");

      // Step 2: Append text
      const updated = current + text;
      const encoded = Buffer.from(updated).toString("base64");

      // Step 3: Upload back
      const buf = Buffer.from(encoded, "base64");
      const media = { mimeType: meta.data.mimeType, body: buf };

      await drive.files.update({ fileId, media });

      return {
        content: [{ type: "text", text: `Appended text to ${fileId}` }],
      };
    }
  );

  server.tool(
    "drive_delete",
    "Trash or delete a file",
    {
      fileId: z.string().describe("ID of the file to delete"),
      permanent: z
        .boolean()
        .optional()
        .describe("Whether to delete permanently"),
    },
    async ({ fileId, permanent }) => {
      if (permanent) {
        await drive.files.delete({ fileId });
        return { content: [{ type: "text", text: `Deleted ${fileId}` }] };
      }
      await drive.files.update({ fileId, requestBody: { trashed: true } });
      return { content: [{ type: "text", text: `Trashed ${fileId}` }] };
    }
  );

  server.tool(
    "drive_share",
    "Manage file permissions",
    {
      fileId: z.string().describe("ID of the file to share"),
      role: z.enum(["reader", "commenter", "writer"]),
      type: z.enum(["user", "group", "domain", "anyone"]),
      emailAddress: z.string().optional().describe("Email to share with"),
    },
    async ({ fileId, role, type, emailAddress }) => {
      const res = await drive.permissions.create({
        fileId,
        requestBody: { role, type, emailAddress },
      });
      return {
        content: [{ type: "text", text: `Granted ${role}: ${res.data.id}` }],
      };
    }
  );

  server.tool(
    "drive_comment",
    "Add a comment to a file",
    {
      fileId: z.string().describe("Id of the file to add the comment to"),
      content: z.string().describe("The comment to be added"),
    },
    async ({ fileId, content }) => {
      const res = await drive.comments.create({
        fileId,
        requestBody: { content },
      });
      return { content: [{ type: "text", text: `Comment ID ${res.data.id}` }] };
    }
  );

  server.tool(
    "drive_copy",
    "Copy a file or folder to a new location",
    z.object({
      fileId: z.string().describe("The ID of the file or folder to copy"),
      newName: z
        .string()
        .optional()
        .describe("Optional new name for the copied file"),
      parentId: z
        .string()
        .optional()
        .describe("Optional destination folder ID"),
    }),
    async ({ fileId, newName, parentId }) => {
      const copied = await drive.files.copy({
        fileId,
        requestBody: {
          name: newName,
          parents: parentId ? [parentId] : undefined,
        },
      });
      return copied.data;
    }
  );

  server.tool(
    "drive_rename",
    "Rename a file or folder",
    z.object({
      fileId: z.string().describe("The ID of the file or folder to rename"),
      newName: z.string().describe("The new name for the file"),
    }),
    async ({ fileId, newName }) => {
      const renamed = await drive.files.update({
        fileId,
        requestBody: { name: newName },
      });
      return renamed.data;
    }
  );

  server.tool(
    "drive_star",
    "Star or unstar a file or folder",
    z.object({
      fileId: z.string().describe("The ID of the file or folder"),
      starred: z.boolean().describe("True to star the file, false to unstar"),
    }),
    async ({ fileId, starred }) => {
      const updated = await drive.files.update({
        fileId,
        requestBody: { starred },
      });
      return updated.data;
    }
  );

  server.tool(
    "drive_restore",
    "Restore a file from the trash",
    z.object({
      fileId: z.string().describe("The ID of the file to restore from trash"),
    }),
    async ({ fileId }) => {
      const restored = await drive.files.update({
        fileId,
        requestBody: { trashed: false },
      });
      return restored.data;
    }
  );

  server.tool(
    "drive_versions_list",
    "List all versions of a file",
    z.object({
      fileId: z.string().describe("The ID of the file"),
    }),
    async ({ fileId }) => {
      const res = await drive.revisions.list({ fileId });
      return res.data.revisions;
    }
  );

  server.tool(
    "drive_versions_delete",
    "Delete a specific version of a file",
    z.object({
      fileId: z.string().describe("The ID of the file"),
      revisionId: z.string().describe("The ID of the revision to delete"),
    }),
    async ({ fileId, revisionId }) => {
      await drive.revisions.delete({ fileId, revisionId });
      return { success: true };
    }
  );

  server.tool(
    "drive_file_lock",
    "Lock or unlock a file to prevent changes (Google Workspace only)",
    z.object({
      fileId: z.string().describe("The ID of the file"),
      locked: z.boolean().describe("True to lock the file, false to unlock"),
    }),
    async ({ fileId, locked }) => {
      const updated = await drive.files.update({
        fileId,
        requestBody: {
          contentRestrictions: [{ readOnly: locked, reason: "Locked via API" }],
        },
      });
      return updated.data;
    }
  );

  server.tool(
    "drive_shortcut_create",
    "Create a shortcut to a file or folder",
    z.object({
      targetId: z.string().describe("The ID of the file or folder to shortcut"),
      name: z.string().optional().describe("Optional name of the shortcut"),
      parentId: z
        .string()
        .optional()
        .describe("Optional destination folder for the shortcut"),
    }),
    async ({ targetId, name, parentId }) => {
      const shortcut = await drive.files.create({
        requestBody: {
          name: name ?? "Shortcut",
          mimeType: "application/vnd.google-apps.shortcut",
          parents: parentId ? [parentId] : undefined,
          shortcutDetails: { targetId },
        },
        fields: "id, name, mimeType",
      });
      return shortcut.data;
    }
  );

  server.tool(
    "drive_permissions_list",
    "List all permissions of a file or folder",
    z.object({
      fileId: z.string().describe("The ID of the file or folder"),
    }),
    async ({ fileId }) => {
      const res = await drive.permissions.list({
        fileId,
        fields: "permissions(id, type, role, emailAddress, domain)",
      });
      return res.data.permissions;
    }
  );

  server.tool(
    "drive_permission_update",
    "Update a user's permission on a file or folder",
    z.object({
      fileId: z.string().describe("The ID of the file or folder"),
      permissionId: z.string().describe("The permission ID to update"),
      role: z
        .enum(["reader", "commenter", "writer", "organizer", "owner"])
        .describe("New role"),
    }),
    async ({ fileId, permissionId, role }) => {
      const res = await drive.permissions.update({
        fileId,
        permissionId,
        requestBody: { role },
      });
      return res.data;
    }
  );

  server.tool(
    "drive_permission_delete",
    "Remove a user's access from a file or folder by permission ID",
    z.object({
      fileId: z.string().describe("The ID of the file or folder"),
      permissionId: z.string().describe("The permission ID to remove"),
    }),
    async ({ fileId, permissionId }) => {
      await drive.permissions.delete({ fileId, permissionId });
      return { success: true };
    }
  );

  server.tool(
    "drive_permission_add_domain",
    "Share file or folder with everyone in a domain",
    z.object({
      fileId: z.string().describe("The ID of the file or folder"),
      domain: z
        .string()
        .describe("Domain name to share with (e.g. example.com)"),
      role: z
        .enum(["reader", "commenter", "writer"])
        .describe("Access level to grant"),
      allowFileDiscovery: z
        .boolean()
        .optional()
        .describe("Whether to allow file to be discoverable"),
    }),
    async ({ fileId, domain, role, allowFileDiscovery }) => {
      const res = await drive.permissions.create({
        fileId,
        requestBody: {
          type: "domain",
          domain,
          role,
          allowFileDiscovery: allowFileDiscovery ?? false,
        },
        fields: "id",
      });
      return res.data;
    }
  );

  server.tool(
    "drive_permission_add_anyone",
    "Allow anyone with the link to access a file or folder",
    z.object({
      fileId: z.string().describe("The ID of the file or folder"),
      role: z
        .enum(["reader", "commenter", "writer"])
        .describe("Access level to grant"),
      allowFileDiscovery: z
        .boolean()
        .optional()
        .describe("Whether the file is publicly searchable"),
    }),
    async ({ fileId, role, allowFileDiscovery }) => {
      const res = await drive.permissions.create({
        fileId,
        requestBody: {
          type: "anyone",
          role,
          allowFileDiscovery: allowFileDiscovery ?? false,
        },
        fields: "id",
      });
      return res.data;
    }
  );

  server.tool(
    "drive_file_list_comments",
    "List all comments on a file",
    z.object({
      fileId: z.string().describe("The ID of the file to list comments for"),
      includeDeleted: z
        .boolean()
        .optional()
        .describe("Whether to include deleted comments"),
    }),
    async ({ fileId, includeDeleted }) => {
      const res = await drive.comments.list({
        fileId,
        fields:
          "comments(id, content, createdTime, modifiedTime, author, deleted, replies)",
        includeDeleted: includeDeleted ?? false,
      });
      return res.data.comments;
    }
  );

  server.tool(
    "drive_file_delete_comment",
    "Delete a comment from a file",
    z.object({
      fileId: z.string().describe("The ID of the file"),
      commentId: z.string().describe("The ID of the comment to delete"),
    }),
    async ({ fileId, commentId }) => {
      await drive.comments.delete({ fileId, commentId });
      return { success: true };
    }
  );

  server.tool(
    "drive_file_reply_to_comment",
    "Reply to a comment on a file",
    z.object({
      fileId: z.string().describe("The ID of the file"),
      commentId: z.string().describe("The ID of the comment to reply to"),
      content: z.string().describe("Text content of the reply"),
    }),
    async ({ fileId, commentId, content }) => {
      const res = await drive.replies.create({
        fileId,
        commentId,
        requestBody: { content },
      });
      return res.data;
    }
  );

  server.tool(
    "drive_file_list_replies",
    "List all replies to a comment on a file",
    z.object({
      fileId: z.string().describe("The ID of the file"),
      commentId: z.string().describe("The ID of the comment"),
    }),
    async ({ fileId, commentId }) => {
      const res = await drive.replies.list({
        fileId,
        commentId,
        fields: "replies(id, content, createdTime, modifiedTime, author)",
      });
      return res.data.replies;
    }
  );

  server.tool(
    "drive_file_delete_reply",
    "Delete a reply to a comment on a file",
    z.object({
      fileId: z.string().describe("The ID of the file"),
      commentId: z.string().describe("The ID of the comment"),
      replyId: z.string().describe("The ID of the reply to delete"),
    }),
    async ({ fileId, commentId, replyId }) => {
      await drive.replies.delete({ fileId, commentId, replyId });
      return { success: true };
    }
  );

  server.tool(
    "drive_file_move",
    "Move a file to different folder(s)",
    z.object({
      fileId: z.string().describe("The ID of the file to move"),
      addParents: z
        .array(z.string())
        .describe("IDs of folders to move the file into"),
      removeParents: z
        .array(z.string())
        .optional()
        .describe("IDs of folders to remove the file from"),
    }),
    async ({ fileId, addParents, removeParents }) => {
      const res = await drive.files.update({
        fileId,
        addParents: addParents.join(","),
        removeParents: removeParents?.join(","),
        fields: "id, name, parents",
      });
      return res.data;
    }
  );

  server.tool(
    "drive_file_empty_trash",
    "Permanently delete all trashed files",
    z.object({}),
    async () => {
      await drive.files.emptyTrash();
      return { success: true };
    }
  );

  server.tool(
    "drive_shared_drives_list",
    "List all accessible Shared Drives",
    {
      pageSize: z
        .number()
        .optional()
        .describe("Number of Shared Drives to return"),
      pageToken: z.string().optional().describe("Token for pagination"),
    },
    async ({ pageSize, pageToken }) => {
      const res = await drive.drives.list({
        pageSize: pageSize || 50,
        pageToken,
        fields:
          "nextPageToken, drives(id, name, createdTime, hidden, capabilities)",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2),
          },
        ],
      };
    }
  );

  // Get Shared Drive metadata
  server.tool(
    "drive_shared_drive_get",
    "Get metadata for a specific Shared Drive",
    {
      driveId: z.string().describe("ID of the Shared Drive"),
    },
    async ({ driveId }) => {
      const res = await drive.drives.get({
        driveId,
        fields:
          "id, name, createdTime, hidden, colorRgb, restrictions, capabilities",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2),
          },
        ],
      };
    }
  );

  // Create a new Shared Drive
  server.tool(
    "drive_shared_drive_create",
    "Create a new Shared Drive",
    {
      name: z.string().describe("Name of the new Shared Drive"),
      colorRgb: z
        .string()
        .optional()
        .describe("Color for the Shared Drive in RGB format"),
      hidden: z
        .boolean()
        .optional()
        .describe("Whether the Shared Drive should be hidden"),
    },
    async ({ name, colorRgb, hidden }) => {
      // Create request ID required for drive creation (must be unique)
      const requestId = `drive-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 10)}`;

      const res = await drive.drives.create({
        requestId,
        requestBody: {
          name,
          colorRgb,
          hidden,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2),
          },
        ],
      };
    }
  );

  // Delete a Shared Drive
  server.tool(
    "drive_shared_drive_delete",
    "Delete a Shared Drive",
    {
      driveId: z.string().describe("ID of the Shared Drive to delete"),
    },
    async ({ driveId }) => {
      await drive.drives.delete({
        driveId,
      });

      return {
        content: [
          {
            type: "text",
            text: `Successfully deleted Shared Drive ${driveId}`,
          },
        ],
      };
    }
  );

  // Update a Shared Drive
  server.tool(
    "drive_shared_drive_update",
    "Update a Shared Drive's metadata",
    {
      driveId: z.string().describe("ID of the Shared Drive to update"),
      name: z.string().optional().describe("New name for the Shared Drive"),
      colorRgb: z
        .string()
        .optional()
        .describe("New color for the Shared Drive"),
      hidden: z
        .boolean()
        .optional()
        .describe("Whether the Shared Drive should be hidden"),
    },
    async ({ driveId, name, colorRgb, hidden }) => {
      const res = await drive.drives.update({
        driveId,
        requestBody: {
          name,
          colorRgb,
          hidden,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2),
          },
        ],
      };
    }
  );

  // List files in a Shared Drive
  server.tool(
    "drive_shared_drive_files",
    "List files in a Shared Drive",
    {
      driveId: z.string().describe("ID of the Shared Drive"),
      pageSize: z.number().optional().describe("Number of files to return"),
      pageToken: z.string().optional().describe("Token for pagination"),
      q: z.string().optional().describe("Search query"),
      orderBy: z
        .string()
        .optional()
        .describe("Sort order (e.g., 'name', 'modifiedTime desc')"),
    },
    async ({ driveId, pageSize, pageToken, q, orderBy }) => {
      const res = await drive.files.list({
        driveId,
        corpora: "drive",
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: pageSize || 50,
        pageToken,
        q,
        orderBy,
        fields:
          "nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, size)",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data, null, 2),
          },
        ],
      };
    }
  );

  // ===== STORAGE QUOTA TOOLS =====

  // Get user's storage quota information
  server.tool(
    "drive_storage_quota",
    "Get storage quota information for the user",
    {},
    async () => {
      const res = await drive.about.get({
        fields: "storageQuota, user",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                user: res.data.user,
                storageQuota: res.data.storageQuota,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Get detailed storage breakdown by file type
  server.tool(
    "drive_storage_breakdown",
    "Get storage usage breakdown by file type",
    {
      maxResults: z
        .number()
        .optional()
        .describe("Maximum number of file types to return"),
    },
    async ({ maxResults }) => {
      // Get all files
      const res = await drive.files.list({
        fields: "files(id, size, mimeType, name, ownedByMe)",
        pageSize: maxResults || 1000,
        q: "ownedByMe=true and trashed=false", // Only include files owned by user and not in trash
      });

      // Group by mime type and calculate total size
      const breakdown = {};
      let totalSize = 0;

      res.data.files.forEach((file) => {
        if (file.size) {
          const size = parseInt(file.size, 10);
          const mimeType = file.mimeType || "unknown";

          if (!breakdown[mimeType]) {
            breakdown[mimeType] = {
              totalSize: 0,
              count: 0,
              sizeInMB: 0,
            };
          }

          breakdown[mimeType].totalSize += size;
          breakdown[mimeType].count += 1;
          breakdown[mimeType].sizeInMB = (
            breakdown[mimeType].totalSize /
            (1024 * 1024)
          ).toFixed(2);
          totalSize += size;
        }
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                totalSizeInBytes: totalSize,
                totalSizeInMB: (totalSize / (1024 * 1024)).toFixed(2),
                totalSizeInGB: (totalSize / (1024 * 1024 * 1024)).toFixed(2),
                fileCount: res.data.files.length,
                breakdown,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ===== BATCH OPERATIONS =====

  // Batch file metadata retrieval
  server.tool(
    "drive_batch_get_metadata",
    "Get metadata for multiple files in a single request",
    {
      fileIds: z
        .array(z.string())
        .describe("Array of file IDs to retrieve metadata for"),
      fields: z
        .string()
        .optional()
        .describe("Comma-separated list of fields to include"),
    },
    async ({ fileIds, fields }) => {
      const fieldList =
        fields || "id,name,mimeType,size,createdTime,modifiedTime,parents";

      // Using Promise.all to make parallel requests
      const promises = fileIds.map((fileId) =>
        drive.files
          .get({
            fileId,
            fields: fieldList,
          })
          .catch((err) => ({
            error: true,
            fileId,
            message: err.message,
          }))
      );

      const results = await Promise.all(promises);

      // Process results
      const successResults = [];
      const failedResults = [];

      results.forEach((result) => {
        if (result.error) {
          failedResults.push(result);
        } else {
          successResults.push(result.data);
        }
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                successful: successResults,
                failed: failedResults,
                summary: {
                  totalRequested: fileIds.length,
                  successful: successResults.length,
                  failed: failedResults.length,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Batch permission changes
  server.tool(
    "drive_batch_update_permissions",
    "Update permissions for multiple files at once",
    {
      operations: z
        .array(
          z.object({
            fileId: z
              .string()
              .describe("ID of the file to update permissions for"),
            permissionDetails: z.object({
              role: z.enum(["reader", "commenter", "writer", "organizer"]),
              type: z.enum(["user", "group", "domain", "anyone"]),
              emailAddress: z.string().optional(),
              domain: z.string().optional(),
            }),
          })
        )
        .describe("Array of operations to perform"),
    },
    async ({ operations }) => {
      // Using Promise.all to make parallel requests
      const promises = operations.map((op) =>
        drive.permissions
          .create({
            fileId: op.fileId,
            requestBody: op.permissionDetails,
            fields: "id,type,role",
          })
          .then((res) => ({
            success: true,
            fileId: op.fileId,
            permission: res.data,
          }))
          .catch((err) => ({
            success: false,
            fileId: op.fileId,
            error: err.message,
          }))
      );

      const results = await Promise.all(promises);

      // Process results
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                results,
                summary: {
                  totalOperations: operations.length,
                  successful: successful.length,
                  failed: failed.length,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Batch delete operation
  server.tool(
    "drive_batch_delete",
    "Delete multiple files or folders at once",
    {
      fileIds: z.array(z.string()).describe("Array of file IDs to delete"),
      permanent: z
        .boolean()
        .optional()
        .describe(
          "Whether to delete permanently (true) or move to trash (false)"
        ),
    },
    async ({ fileIds, permanent }) => {
      const isPermanent = permanent === true;

      // Using Promise.all for parallel operations
      const promises = fileIds.map((fileId) => {
        if (isPermanent) {
          return drive.files
            .delete({
              fileId,
            })
            .then(() => ({
              success: true,
              fileId,
              operation: "permanent delete",
            }))
            .catch((err) => ({
              success: false,
              fileId,
              operation: "permanent delete",
              error: err.message,
            }));
        } else {
          return drive.files
            .update({
              fileId,
              requestBody: { trashed: true },
            })
            .then(() => ({
              success: true,
              fileId,
              operation: "trash",
            }))
            .catch((err) => ({
              success: false,
              fileId,
              operation: "trash",
              error: err.message,
            }));
        }
      });

      const results = await Promise.all(promises);

      // Process results
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                results,
                summary: {
                  totalOperations: fileIds.length,
                  successful: successful.length,
                  failed: failed.length,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Batch copy operation
  server.tool(
    "drive_batch_copy",
    "Copy multiple files to a destination folder",
    {
      operations: z
        .array(
          z.object({
            fileId: z.string().describe("ID of the file to copy"),
            destinationFolderId: z
              .string()
              .optional()
              .describe("ID of the destination folder"),
            newName: z
              .string()
              .optional()
              .describe("New name for the copy (optional)"),
          })
        )
        .describe("Array of copy operations to perform"),
    },
    async ({ operations }) => {
      // Using Promise.all for parallel operations
      const promises = operations.map((op) => {
        const requestBody = {
          name: op.newName,
        };

        if (op.destinationFolderId) {
          requestBody.parents = [op.destinationFolderId];
        }

        return drive.files
          .copy({
            fileId: op.fileId,
            requestBody,
            fields: "id,name,parents",
          })
          .then((res) => ({
            success: true,
            sourceFileId: op.fileId,
            newFileId: res.data.id,
            newName: res.data.name,
          }))
          .catch((err) => ({
            success: false,
            sourceFileId: op.fileId,
            error: err.message,
          }));
      });

      const results = await Promise.all(promises);

      // Process results
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                results,
                summary: {
                  totalOperations: operations.length,
                  successful: successful.length,
                  failed: failed.length,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Batch move operation
  server.tool(
    "drive_batch_move",
    "Move multiple files to a destination folder",
    {
      operations: z
        .array(
          z.object({
            fileId: z.string().describe("ID of the file to move"),
            destinationFolderId: z
              .string()
              .describe("ID of the destination folder"),
            removeFromCurrentFolders: z
              .boolean()
              .optional()
              .describe(
                "Whether to remove from current folders (true) or keep in current folders (false)"
              ),
          })
        )
        .describe("Array of move operations to perform"),
    },
    async ({ operations }) => {
      // Get current parents for each file first when needed
      const operationsWithParents = await Promise.all(
        operations.map(async (op) => {
          if (
            op.removeFromCurrentFolders === true ||
            op.removeFromCurrentFolders === undefined
          ) {
            try {
              const fileData = await drive.files.get({
                fileId: op.fileId,
                fields: "parents",
              });
              return {
                ...op,
                currentParents: fileData.data.parents?.join(",") || "",
              };
            } catch (err) {
              return {
                ...op,
                error: err.message,
              };
            }
          }
          return op;
        })
      );

      // Perform the actual moves
      const promises = operationsWithParents.map((op) => {
        if (op.error) {
          return Promise.resolve({
            success: false,
            fileId: op.fileId,
            error: op.error,
          });
        }

        const params = {
          fileId: op.fileId,
          addParents: op.destinationFolderId,
          fields: "id,name,parents",
        };

        if (
          op.removeFromCurrentFolders === true ||
          op.removeFromCurrentFolders === undefined
        ) {
          params.removeParents = op.currentParents;
        }

        return drive.files
          .update(params)
          .then((res) => ({
            success: true,
            fileId: op.fileId,
            newParents: res.data.parents,
          }))
          .catch((err) => ({
            success: false,
            fileId: op.fileId,
            error: err.message,
          }));
      });

      const results = await Promise.all(promises);

      // Process results
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                results,
                summary: {
                  totalOperations: operations.length,
                  successful: successful.length,
                  failed: failed.length,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  return server;
}

const { app } = createStatelessServer(createMcpServer);
const port = process.env.PORT || 8081;
app.listen(port, () => console.log(`MCP server listening on ${port}`));
