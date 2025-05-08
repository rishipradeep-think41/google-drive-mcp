import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createStatelessServer } from "@smithery/sdk/server/stateless.js";
import * as dotenv from "dotenv";
import { join } from "path";
import { google } from "googleapis";
import { z } from "zod";

dotenv.config({ path: join(process.cwd(), ".env") });

function createMcpServer({ config }) {
  const CLIENT_ID = config?.CLIENT_ID || process.env.CLIET_ID;
  const CLIENT_SECRET = config?.CLIENT_SECRET || process.env.CLIENT_SECRET;
  const REFRESH_TOKEN = config?.REFRESH_TOKEN || process.env.REFRESH_TOKEN;

  const server = new McpServer(
    { name: "google-drive-server", version: "0.1.0" },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  auth.setCredentials({ refresh_token: REFRESH_TOKEN });
  const drive = google.drive({ version: "v3", auth: auth });

  // --- Tool: gdrive_search ---
  server.tool(
    "gdrive_search",
    "Search for files in Google Drive",
    {
      query: z.string().describe("Name of the file to be searched for"),
      pageToken: z
        .string()
        .optional()
        .describe("Token for the next page of results"),
      pageSize: z
        .number()
        .optional()
        .describe("Number of results per page (max 100)"),
    },
    async ({ query, pageToken, pageSize }) => {
      const userQuery = query.trim();
      let searchQuery = "";

      // If query is empty, list all files
      if (!userQuery) {
        searchQuery = "trashed = false";
      } else {
        // Escape special characters in the query
        const escapedQuery = userQuery
          .replace(/\\/g, "\\\\")
          .replace(/'/g, "\\'");

        // Build search query with multiple conditions
        const conditions = [];

        // Search in title
        conditions.push(`name contains '${escapedQuery}'`);

        // If specific file type is mentioned in query, add mimeType condition
        if (userQuery.toLowerCase().includes("sheet")) {
          conditions.push(
            "mimeType = 'application/vnd.google-sheets.spreadsheet'"
          );
        }

        searchQuery = `(${conditions.join(" or ")}) and trashed = false`;
      }

      const res = await drive.files.list({
        q: searchQuery,
        pageSize: pageSize || 10,
        pageToken: pageToken,
        orderBy: "modifiedTime desc",
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size)",
      });

      const fileList = res.data.files
        ?.map((file) => `${file.id} ${file.name} (${file.mimeType})`)
        .join("\n");

      let response = `Found ${res.data.files?.length ?? 0} files:\n${fileList}`;

      // Add pagination info if there are more results
      if (res.data.nextPageToken) {
        response += `\n\nMore results available. Use pageToken: ${res.data.nextPageToken}`;
      }

      return {
        content: [
          {
            type: "text",
            text: response,
          },
        ],
      };
    }
  );

  // --- Tool: gdrive_read_file ---
  server.tool(
    "gdrive_read_file",
    "Read contents of a file from Google Drive",
    {
      fileId: z.string().describe("ID of the file to read"),
    },
    async ({ fileId }) => {
      // First get file metadata to check mime type
      const file = await drive.files.get({
        fileId,
        fields: "mimeType,name",
      });

      // For Google Docs/Sheets/etc we need to export
      if (file.data.mimeType?.startsWith("application/vnd.google-apps")) {
        let exportMimeType;
        switch (file.data.mimeType) {
          case "application/vnd.google-apps.document":
            exportMimeType = "text/markdown";
            break;
          case "application/vnd.google-apps.spreadsheet":
            exportMimeType = "text/csv";
            break;
          case "application/vnd.google-apps.presentation":
            exportMimeType = "text/plain";
            break;
          case "application/vnd.google-apps.drawing":
            exportMimeType = "image/png";
            break;
          default:
            exportMimeType = "text/plain";
        }

        const res = await drive.files.export(
          { fileId, mimeType: exportMimeType },
          { responseType: "text" }
        );

        return {
          content: [
            {
              type: "text",
              text: `Contents of ${file.data.name || fileId}:\n\n${res.data}`,
            },
          ],
        };
      }

      // For regular files download content
      const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "arraybuffer" }
      );
      const mimeType = file.data.mimeType || "application/octet-stream";
      const isText =
        mimeType.startsWith("text/") || mimeType === "application/json";
      const content = Buffer.from(res.data);

      return {
        content: [
          {
            type: "text",
            text: `Contents of ${file.data.name || fileId}:\n\n${
              isText ? content.toString("utf-8") : content.toString("base64")
            }`,
          },
        ],
      };
    }
  );
  return server;
}

const { app } = createStatelessServer(createMcpServer);
const port = process.env.PORT || 8081;
app.listen(port, () => {
  console.log(`MCP server running on port ${port}`);
});
