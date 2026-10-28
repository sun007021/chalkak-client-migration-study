package kr.chalkak.feature.upload.edit

/** 4x5 colour matrices of the six filters (appendix "필터 4x5 행렬"; single source with `shared/photo-edit/filters.json` once it exists). */
internal object FilterMatrices {
    private val ALPHA_ROW = listOf(0.0, 0.0, 0.0, 1.0, 0.0)
    private val GRAY_ROW = listOf(0.299, 0.587, 0.114, 0.0, 0.0)

    private val matrices: Map<PhotoFilter, List<Double>> = mapOf(
        PhotoFilter.MONO to (GRAY_ROW + GRAY_ROW + GRAY_ROW + ALPHA_ROW),
        PhotoFilter.WARM to (
            listOf(1.08, 0.0, 0.0, 0.0, 8.0) + listOf(0.0, 1.02, 0.0, 0.0, 4.0) +
                listOf(0.0, 0.0, 0.88, 0.0, 0.0) + ALPHA_ROW
            ),
        PhotoFilter.COOL to (
            listOf(0.9, 0.0, 0.0, 0.0, 0.0) + listOf(0.0, 1.0, 0.0, 0.0, 2.0) +
                listOf(0.0, 0.0, 1.1, 0.0, 10.0) + ALPHA_ROW
            ),
        PhotoFilter.VINTAGE to (
            listOf(0.63, 0.35, 0.09, 0.0, 18.0) + listOf(0.16, 0.76, 0.08, 0.0, 14.0) +
                listOf(0.12, 0.24, 0.51, 0.0, 10.0) + ALPHA_ROW
            ),
        PhotoFilter.VIVID to (
            listOf(1.2754, -0.2503, -0.0252, 0.0, 0.0) + listOf(-0.0746, 1.0997, -0.0252, 0.0, 0.0) +
                listOf(-0.0746, -0.2503, 1.3248, 0.0, 0.0) + ALPHA_ROW
            ),
    )

    /** Null for [PhotoFilter.ORIGINAL] (not applied). */
    fun of(filter: PhotoFilter): List<Double>? = matrices[filter]
}
