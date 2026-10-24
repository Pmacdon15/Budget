import { vi } from "vitest";

// Server actions call this after a successful write.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
