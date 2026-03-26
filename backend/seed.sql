insert into suppliers (name, contact_email, api_base_url)
select 'GF Base Supplier', 'ops@gfshop.com', 'https://api.supplier.local'
where not exists (
  select 1 from suppliers where name = 'GF Base Supplier'
);

insert into products (supplier_id, sku, name, category, description, image_url, cost_price, sale_price, stock, active)
values
  (1, 'GF-DIF-001', 'Difusor ultrasónico premium', 'Hogar', 'Difusor silencioso con luz ambiental.', 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=900&q=80', 73000, 129900, 24, true),
  (1, 'GF-SMW-002', 'Smartwatch deportivo S2', 'Tecnología', 'Monitoreo de salud, bluetooth y resistencia al agua.', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80', 130000, 219900, 16, true),
  (1, 'GF-ASP-003', 'Aspiradora portátil', 'Hogar', 'Limpieza rápida para carro y espacios pequeños.', 'https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=900&q=80', 50000, 89900, 31, true),
  (1, 'GF-BIE-004', 'Corrector de postura inteligente', 'Bienestar', 'Alerta de vibración para mejorar postura diaria.', 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=900&q=80', 38000, 74900, 47, true),
  (1, 'GF-TEC-005', 'Proyector mini HD', 'Tecnología', 'Proyección HD para entretenimiento en casa.', 'https://images.unsplash.com/photo-1571415060716-baff5f717c37?auto=format&fit=crop&w=900&q=80', 164000, 274900, 11, true),
  (1, 'GF-COC-006', 'Set organizador de cocina', 'Cocina', 'Set modular para organizar alacena y despensa.', 'https://images.unsplash.com/photo-1473447198193-2f113599d91b?auto=format&fit=crop&w=900&q=80', 32000, 65900, 40, true),
  (1, 'GF-HOG-007', 'Lampara led recargable', 'Hogar', 'Lampara tactil con 3 niveles de intensidad.', 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80', 28000, 58900, 54, true),
  (1, 'GF-TEC-008', 'Audifonos bluetooth Pro', 'Tecnología', 'Cancelacion de ruido y estuche de carga rapida.', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80', 69000, 139900, 33, true),
  (1, 'GF-BIE-009', 'Masajeador cervical', 'Bienestar', 'Masaje por pulsos para cuello y hombros.', 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=80', 47000, 94900, 27, true),
  (1, 'GF-COC-010', 'Sartén antiadherente 3 piezas', 'Cocina', 'Set resistente con mango ergonomico.', 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=900&q=80', 84000, 149900, 22, true),
  (1, 'GF-MAS-011', 'Mochila antirrobo urbana', 'Moda', 'Compartimento oculto y puerto USB.', 'https://images.unsplash.com/photo-1491637639811-60e2756cc1c7?auto=format&fit=crop&w=900&q=80', 58000, 114900, 38, true),
  (1, 'GF-MAS-012', 'Reloj minimalista hombre', 'Moda', 'Diseño elegante para uso diario.', 'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?auto=format&fit=crop&w=900&q=80', 44000, 89900, 25, true),
  (1, 'GF-HOG-013', 'Cámara de seguridad wifi', 'Hogar', 'Vision nocturna y notificaciones al movil.', 'https://images.unsplash.com/photo-1557324232-b8917d3c3dcb?auto=format&fit=crop&w=900&q=80', 92000, 169900, 18, true),
  (1, 'GF-TEC-014', 'Teclado mecanico RGB', 'Tecnología', 'Switches tactiles y luz personalizable.', 'https://images.unsplash.com/photo-1517336714739-489689fd1ca8?auto=format&fit=crop&w=900&q=80', 115000, 199900, 20, true),
  (1, 'GF-BIE-015', 'Rodillo de masaje deportivo', 'Bienestar', 'Ideal para recuperacion muscular post entrenamiento.', 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=900&q=80', 26000, 54900, 48, true),
  (1, 'GF-COC-016', 'Freidora de aire compacta', 'Cocina', 'Cocina saludable con poco aceite.', 'https://images.unsplash.com/photo-1585238342024-78d387f4a707?auto=format&fit=crop&w=900&q=80', 170000, 289900, 14, true),
  (1, 'GF-MAS-017', 'Bolso crossbody mujer', 'Moda', 'Diseño moderno, liviano y resistente.', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=80', 39000, 79900, 36, true),
  (1, 'GF-TEC-018', 'Mini impresora termica', 'Tecnología', 'Impresion de stickers y notas desde app.', 'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?auto=format&fit=crop&w=900&q=80', 62000, 124900, 29, true),
  (1, 'GF-HOG-019', 'Humidificador portatil USB', 'Hogar', 'Neblina fina para escritorio y carro.', 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=900&q=80', 24000, 49900, 57, true),
  (1, 'GF-BIE-020', 'Set bandas elasticas fitness', 'Bienestar', 'Kit completo para entrenar en casa.', 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80', 21000, 45900, 62, true),
  (1, 'GF-COC-021', 'Dispensador de cereal doble', 'Cocina', 'Ahorra espacio y mantiene frescura.', 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=80', 45000, 92900, 31, true),
  (1, 'GF-MAS-022', 'Gafas de sol polarizadas', 'Moda', 'Proteccion UV400 y estilo moderno.', 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=80', 28000, 59900, 44, true),
  (1, 'GF-TEC-023', 'Cargador inalambrico 3 en 1', 'Tecnología', 'Carga celular, reloj y audifonos al tiempo.', 'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=900&q=80', 76000, 149900, 19, true),
  (1, 'GF-HOG-024', 'Set organizador de cables', 'Hogar', 'Mantiene escritorio limpio y ordenado.', 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=900&q=80', 13000, 29900, 85, true),
  (1, 'GF-BIE-025', 'Pistola de masaje muscular', 'Bienestar', 'Alivio profundo con multiples cabezales.', 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?auto=format&fit=crop&w=900&q=80', 98000, 189900, 17, true),
  (1, 'GF-COC-026', 'Molinillo electrico de cafe', 'Cocina', 'Molienda uniforme para cafe fresco.', 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80', 56000, 109900, 24, true)
on conflict (sku) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  image_url = excluded.image_url,
  cost_price = excluded.cost_price,
  sale_price = excluded.sale_price,
  stock = excluded.stock,
  active = excluded.active,
  updated_at = now();
