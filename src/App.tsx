import { useState } from "react";
import "./App.css";

interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  handle?: FileSystemFileHandle; 
}

interface FileTreeProps {
  structure: FileNode[];
  onFileClick: (fileHandle: FileSystemFileHandle) => void;
}

const FileTree = ({ structure, onFileClick }: FileTreeProps) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <ul>
      {structure.map((node, index) => (
        <li key={index}>
          {node.type === "folder" ? (
            <>
              <span onClick={() => toggleExpand(node.name)}>
                {expanded[node.name] ? "📂" : "📁"} {node.name}
              </span>
              {expanded[node.name] && node.children && (
                <FileTree structure={node.children} onFileClick={onFileClick} />
              )}
            </>
          ) : (
            <span
              onClick={() => onFileClick(node.handle as FileSystemFileHandle)}
            >
              📄 {node.name}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
};

const App = () => {
  const [fileStructure, setFileStructure] = useState<FileNode[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const [snykContent, setSnykContent] = useState("");

  const handleFolderSelection = async () => {
    try {
      const folderHandle = await (window as any).showDirectoryPicker();
      const structure = await readDirectory(folderHandle);
      setFileStructure(structure);

      // Check for existing .snyk file in root
      const snykFile = structure.find(
        (file) => file.name === ".snyk" && file.type === "file"
      );
      if (snykFile) {
        await backupAndReplaceSnyk(folderHandle, snykFile.handle!);
      } else {
        await createNewSnyk(folderHandle);
      }
    } catch (error) {
      console.error("Error reading directory:", error);
    }
  };

  const readDirectory = async (
    directoryHandle: FileSystemDirectoryHandle
  ): Promise<FileNode[]> => {
    const files: FileNode[] = [];
    for await (const [name, handle] of (directoryHandle as any).entries()) {
      if (handle.kind === "directory") {
        files.push({
          name,
          type: "folder",
          children: await readDirectory(handle as FileSystemDirectoryHandle),
        });
      } else {
        files.push({ name, type: "file", handle: handle as FileSystemFileHandle });
      }
    }
    return files;
  };

  const backupAndReplaceSnyk = async (
    folderHandle: FileSystemDirectoryHandle,
    snykFileHandle: FileSystemFileHandle
  ) => {
    try {
      // Create a backup folder if it doesn't exist
      let backupFolderHandle: FileSystemDirectoryHandle;
      try {
        backupFolderHandle = await folderHandle.getDirectoryHandle("backup", {
          create: true,
        });
      } catch (error) {
        console.error("Failed to create backup folder:", error);
        return;
      }

      // Move the .snyk file to the backup folder
      const file = await snykFileHandle.getFile();
      const newFileHandle = await backupFolderHandle.getFileHandle(
        file.name,
        { create: true }
      );
      const writable = await (newFileHandle as any).createWritable();
      await writable.write(await file.arrayBuffer());
      await writable.close();

      // Delete the original .snyk file
      await (folderHandle as any).removeEntry(".snyk");
      console.log(".snyk file backed up successfully!");

      // Create a new .snyk file
      await createNewSnyk(folderHandle);
    } catch (error) {
      console.error("Error during backup and replace:", error);
    }
  };

  const createNewSnyk = async (folderHandle: FileSystemDirectoryHandle) => {
    try {
     await folderHandle.getFileHandle(".snyk", {
        create: true,
      });
      setPopupVisible(true); // Show popup for content input
    } catch (error) {
      console.error("Error creating .snyk file:", error);
    }
  };

  const handleFileClick = async (fileHandle: FileSystemFileHandle) => {
    try {
      const file = await fileHandle.getFile();
      const content = await file.text();
      setFileContent(content);
    } catch (error) {
      console.error("Error reading file:", error);
      setFileContent("Unable to read file content.");
    }
  };

  const handleSaveSnyk = async () => {
    if (fileStructure.length > 0) {
      const rootHandle = (await (window as any).showDirectoryPicker()) as FileSystemDirectoryHandle;
      const snykHandle = await rootHandle.getFileHandle(".snyk", {
        create: true,
      });
      const writable = await snykHandle.createWritable();
      await writable.write(snykContent);
      await writable.close();
      setPopupVisible(false);
      console.log(".snyk file updated successfully!");
    }
  };

  return (
    <div>
      <h1>File Structure Viewer</h1>
      <button onClick={handleFolderSelection}>Select Folder</button>
      {fileStructure.length > 0 && (
        <FileTree structure={fileStructure} onFileClick={handleFileClick} />
      )}
      {fileContent && (
        <div>
          <h2>File Content</h2>
          <pre>{fileContent}</pre>
        </div>
      )}
      {popupVisible && (
        <div className="popup">
          <h2>Edit .snyk Content</h2>
          <textarea
            value={snykContent}
            onChange={(e) => setSnykContent(e.target.value)}
          />
          <button onClick={handleSaveSnyk}>Save</button>
          <button onClick={() => setPopupVisible(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
};

export default App;
