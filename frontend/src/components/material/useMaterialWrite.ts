import {useUser} from '@contexts/user/UserContext.ts'
import {updateMaterialGlobal, updateMaterialOwn} from '@authorization/privileges.ts'
import {mayWriteMaterial} from '../../pages/material/materialDashboardLogic.ts'

/** Darf das angemeldete Konto beim Anbieter `providerId` schreiben? Siehe `mayWriteMaterial`. */
export const useMaterialWrite = (providerId: string | undefined): boolean => {
    const user = useUser()
    return mayWriteMaterial({
        mayUpdateGlobal: user.checkPrivilege(updateMaterialGlobal),
        mayUpdateOwn: user.checkPrivilege(updateMaterialOwn),
        ownProviderId: user.loggedIn ? user.materialProviderId : undefined,
        providerId,
    })
}
