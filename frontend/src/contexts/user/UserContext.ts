import {createContext, useContext} from 'react'
import {Action, LoginDto, Privilege, Resource, Scope} from '@api/types.gen.ts'
import {Language} from '@i18n/config.ts'

export type AuthenticatedUser = {
    language: Language
    changeLanguage: (language: Language) => Promise<void>
    loggedIn: true
    id: string
    clubId?: string
    login: (data: LoginDto, headers: Headers, isInApp?: boolean) => void
    logout: (isInApp?: boolean) => void
    getPrivilegeScope: (action: Action, resource: Resource) => Scope | undefined
    checkPrivilege: (privilege: Privilege) => boolean
    /**
     * The session token this render currently authenticates REST calls with (see the request
     * interceptor in `UserProvider`) - `null` only while a token exists but the server hasn't
     * confirmed it yet is impossible here (`loggedIn: true` implies a confirmed token), included on
     * both branches of `User` purely so a caller doesn't have to narrow first. Consumers that need
     * the SAME token a REST call would use right now (rather than whatever happens to sit in
     * storage) read this instead of `sessionToken.ts` directly - see `useTimingWebSocket`.
     */
    token: string
}

export type AnonymousUser = {
    language: Language
    changeLanguage: (language: Language) => Promise<void>
    loggedIn: false
    login: (data: LoginDto, headers: Headers, isInApp?: boolean) => void
    getPrivilegeScope: (action: Action, resource: Resource) => undefined
    checkPrivilege: (privilege: Privilege) => false
    /** See `AuthenticatedUser.token`. Not yet confirmed authenticated, so may still be `null`. */
    token: string | null
}

export type User = AuthenticatedUser | AnonymousUser

export const UserContext = createContext<User | null>(null)

export const useUser = (): User => {
    const user = useContext(UserContext)
    if (user === null) {
        throw Error('User context not initialized')
    }
    return user
}

export const useAuthenticatedUser = (): AuthenticatedUser => {
    const user = useUser()
    if (!user.loggedIn) {
        throw Error('User is not authenticated')
    }
    return user
}
