export type Book = {
  id: string;
  uploader_id: string;
  title: string;
  author: string;
  description: string | null;
  category: string | null;
  cover_url: string | null;
  file_path: string;
  file_size: number;
  page_count: number;
  allow_reading: boolean;
  allow_download: boolean;
  status: "published" | "pending" | "removed";
  created_at: string;
};

export type Profile = {
  id: string;
  display_name: string | null;
  created_at: string;
};