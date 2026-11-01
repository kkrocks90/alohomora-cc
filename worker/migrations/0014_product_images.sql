ALTER TABLE products ADD COLUMN images TEXT NOT NULL DEFAULT '[]';

UPDATE products
SET image = 'https://pub-3e6a27e671504bceb10d039909e8722e.r2.dev/products/' || image
WHERE image NOT LIKE 'http%';

UPDATE products SET images = json_array(image);
