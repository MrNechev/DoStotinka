import { CATEGORY_TEMPLATE } from '@slavotax/shared';
import type { Database } from '../db';
import { categories } from '../db/schema';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0] | Database;

/** Creates the default category tree for a user. Returns a map systemKey → id. */
export async function seedDefaultCategories(tx: Tx, userId: string): Promise<Map<string, string>> {
  const keyToId = new Map<string, string>();
  const parents = CATEGORY_TEMPLATE.map((g, i) => ({
    userId,
    parentId: null,
    kind: g.kind,
    name: g.name,
    icon: g.icon,
    color: g.color,
    sortOrder: i,
    systemKey: g.key,
  }));
  const inserted = await tx
    .insert(categories)
    .values(parents)
    .returning({ id: categories.id, systemKey: categories.systemKey });
  for (const row of inserted) keyToId.set(row.systemKey!, row.id);

  const children = CATEGORY_TEMPLATE.flatMap((g) =>
    g.children.map((ch, i) => ({
      userId,
      parentId: keyToId.get(g.key)!,
      kind: g.kind,
      name: ch.name,
      icon: ch.icon,
      color: null,
      sortOrder: i,
      systemKey: `${g.key}.${ch.key}`,
    })),
  );
  const insertedChildren = await tx
    .insert(categories)
    .values(children)
    .returning({ id: categories.id, systemKey: categories.systemKey });
  for (const row of insertedChildren) keyToId.set(row.systemKey!, row.id);
  return keyToId;
}
