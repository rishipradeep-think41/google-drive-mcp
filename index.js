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

  // MCP discovery info
  server.resource(
    "drive_mcp_info",
    "http://localhost:8081/mcp/discover_mcp_capabilities",
    z.object({}),
    async () => {
      return {
        contents: [
          {
            uri: "mcp://discovery",
            text: JSON.stringify(
              {
                server: { name: "google-drive-server", version: "0.2.0" },
                resources: [
                  "drive_roots",
                  "drive_folder_children",
                  "drive_file_metadata",
                  "drive_file_content",
                  "drive_search",
                  "drive_changes",
                  "drive_mcp_info",
                ],
                tools: [
                  "drive_create",
                  "drive_upload",
                  "drive_delete",
                  "drive_share",
                  "drive_comment",
                ],
              },
              null,
              2
            ),
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

  return server;
}

const { app } = createStatelessServer(createMcpServer);
const port = process.env.PORT || 8081;
app.listen(port, () => console.log(`MCP server listening on ${port}`));
