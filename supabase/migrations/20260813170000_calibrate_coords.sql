-- Recalibración WGS84 (OpenStreetMap / GPS del celular).
-- Pereira ~4.81, -75.69 · Dosquebradas ~4.84, -75.67
-- Si lat/lng se guardaron al revés, las chinchetas caen en el océano o en
-- África: este script las intercambia. Es idempotente.

update public.reports
set lat = lng, lng = lat
where lat between -76.5 and -75.0
  and lng between 4.55 and 5.15;

update public.collection_points
set lat = lng, lng = lat
where lat between -76.5 and -75.0
  and lng between 4.55 and 5.15;

update public.people_status
set lat = lng, lng = lat
where lat between -76.5 and -75.0
  and lng between 4.55 and 5.15;
