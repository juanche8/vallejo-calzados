-- ============================================================
-- Migración: Agregar campo DISPONIBILIDAD a productos pre-alta
-- Ejecutar en: db_cegid
-- Fecha: 2025
-- ============================================================

-- 1. Agregar columna a la tabla (sin romper datos existentes)
ALTER TABLE TBL_PRODUCTOS_PRE_ALTA
    ADD disponibilidad VARCHAR(MAX) NULL;
GO

-- 2. Modificar SP de INSERT para aceptar el nuevo parámetro
-- (Reemplaza el SP existente — ajusta el cuerpo según tu versión actual)
ALTER PROCEDURE SP_TBL_PRODUCTOS_PRE_ALTA_INSERT
    @codarticulo      VARCHAR(100)  = NULL,
    @nommarca         VARCHAR(100)  = NULL,
    @nomprov          VARCHAR(100)  = NULL,
    @nomseccion       VARCHAR(100)  = NULL,
    @nomgenero        VARCHAR(100)  = NULL,
    @nomflia          VARCHAR(100)  = NULL,
    @nomlinea         VARCHAR(100)  = NULL,
    @temporada        VARCHAR(100)  = NULL,
    @tituloseo        VARCHAR(500)  = NULL,
    @descripcion      VARCHAR(MAX)  = NULL,
    @color            VARCHAR(100)  = NULL,
    @material         VARCHAR(100)  = NULL,
    @talle            VARCHAR(500)  = NULL,
    @costo            VARCHAR(100)  = NULL,
    @precio           VARCHAR(100)  = NULL,
    @nomdep           VARCHAR(100)  = NULL,
    @observaciones    VARCHAR(MAX)  = NULL,
    @disponibilidad   VARCHAR(MAX)  = NULL,   -- NUEVO
    @imagen_original  VARCHAR(500)  = NULL,
    @imagen_editada   VARCHAR(500)  = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO TBL_PRODUCTOS_PRE_ALTA (
        codarticulo, nommarca, nomprov, nomseccion, nomgenero, nomflia, nomlinea,
        temporada, tituloseo, descripcion, color, material, talle, costo, precio,
        nomdep, observaciones, disponibilidad, imagen_original, imagen_editada
    )
    VALUES (
        @codarticulo, @nommarca, @nomprov, @nomseccion, @nomgenero, @nomflia, @nomlinea,
        @temporada, @tituloseo, @descripcion, @color, @material, @talle, @costo, @precio,
        @nomdep, @observaciones, @disponibilidad, @imagen_original, @imagen_editada
    );
    SELECT SCOPE_IDENTITY() AS id_insertado;
END
GO

-- 3. Modificar SP de GET para devolver la nueva columna
-- (Reemplaza el SP existente — ajusta filtros/ORDER BY según tu versión actual)
ALTER PROCEDURE SP_TBL_PRODUCTOS_PRE_ALTA_GET
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        id,
        ts,
        codarticulo,
        nommarca,
        nomprov,
        nomseccion,
        nomgenero,
        nomflia,
        nomlinea,
        temporada,
        tituloseo,
        descripcion,
        color,
        material,
        talle,
        costo,
        precio,
        nomdep,
        observaciones,
        disponibilidad,   -- NUEVO
        imagen_original,
        imagen_editada
    FROM TBL_PRODUCTOS_PRE_ALTA
    ORDER BY ts DESC;
END
GO
