package de.lambda9.ready2race.backend.app.role.entity

import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.calls.responses.ApiError
import de.lambda9.ready2race.backend.calls.responses.ErrorCode
import io.ktor.http.*
import java.util.*

sealed interface RoleError : ServiceError {

    data object Static : RoleError
    data object NotFound : RoleError
    data object JobRequired : RoleError
    data object JobUnknown : RoleError
    data object JobNotCopyable : RoleError
    data object SelfAssignment : RoleError
    data class PrivilegeUnknown(val privileges: List<UUID>) : RoleError
    data class PrivilegesBeyondOwn(val privileges: List<UUID>) : RoleError
    data class ScopeNotAllowedForLevel(val level: RoleLevel) : RoleError
    data class CannotAssignRoles(val notFound: List<UUID>, val notAssignable: List<UUID>) : RoleError

    override fun respond(): ApiError = when (this) {
        NotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Role not found")
        Static -> ApiError(status = HttpStatusCode.Forbidden, message = "Role is static and cannot be changed")
        JobRequired -> ApiError(
            status = HttpStatusCode.BadRequest,
            message = "A role is created as copy of a job; job is required",
        )
        JobUnknown -> ApiError(status = HttpStatusCode.BadRequest, message = "Unknown job")
        JobNotCopyable -> ApiError(
            status = HttpStatusCode.BadRequest,
            message = "This job is assigned by the system and cannot be copied into a role",
        )
        SelfAssignment -> ApiError(
            status = HttpStatusCode.Forbidden,
            message = "Nobody changes their own role assignments",
            errorCode = ErrorCode.SELF_ASSIGNMENT,
        )
        is PrivilegeUnknown -> ApiError(
            status = HttpStatusCode.BadRequest,
            message = "Unknown privileges",
            details = mapOf("privileges" to privileges),
        )
        is PrivilegesBeyondOwn -> ApiError(
            status = HttpStatusCode.Forbidden,
            message = "Cannot grant privileges one does not hold",
            details = mapOf("privileges" to privileges),
            errorCode = ErrorCode.PRIVILEGES_BEYOND_OWN,
        )
        is ScopeNotAllowedForLevel -> ApiError(
            status = HttpStatusCode.BadRequest,
            message = "Privilege scope does not fit role level ${level.name}",
        )
        is CannotAssignRoles -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Cannot assign some roles",
            details = listOfNotNull(
                notFound.takeIf { it.isNotEmpty() }?.let { "notFound" to it },
                notAssignable.takeIf { it.isNotEmpty() }?.let { "notAssignable" to it }
            ).toMap(),
            errorCode = ErrorCode.CANNOT_ASSIGN_ROLES,
        )
    }
}
