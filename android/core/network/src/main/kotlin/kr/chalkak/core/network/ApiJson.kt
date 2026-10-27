package kr.chalkak.core.network

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json

object ApiJson {
    /** ignoreUnknownKeys = true, explicitNulls = false, strict enums (no coercion). */
    val instance: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = false
    }
}

/**
 * Enum serializer that maps any unknown value to [fallback] instead of failing (TC-NET-009).
 * Use it only where a feature rule says unknown values are displayable (e.g. notification type).
 */
open class SafeEnumSerializer<E : Enum<E>>(values: Array<E>, fallback: E) : KSerializer<E> by safeEnum(values, fallback)

private fun <E : Enum<E>> safeEnum(values: Array<E>, fallback: E): KSerializer<E> = object : KSerializer<E> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("SafeEnum.${fallback.javaClass.name}", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): E {
        val raw = decoder.decodeString()
        return values.firstOrNull { it.name == raw } ?: fallback
    }

    override fun serialize(encoder: Encoder, value: E) = encoder.encodeString(value.name)
}
