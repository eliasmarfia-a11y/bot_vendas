const { sqliteTable, text, integer, real } = require('drizzle-orm/sqlite-core');

const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  price: real('price').notNull(),
  stock: integer('stock').default(0),
  category: text('category'),
});

const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

module.exports = { products, settings };
