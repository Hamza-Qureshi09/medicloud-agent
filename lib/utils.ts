

export async function getOrCreateInstanceId(path:string): Promise<string> {
  const existing = await Deno.readTextFile(path).catch(() => "");
  if (existing.trim()) return existing.trim();
  const instanceId = crypto.randomUUID();
  await Deno.mkdir("./data", { recursive: true });
  await Deno.writeTextFile(path, instanceId);
  return instanceId;
}