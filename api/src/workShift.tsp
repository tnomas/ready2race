import "@typespec/http";
import "@typespec/rest";

using TypeSpec.Http;
using TypeSpec.Rest;

namespace Ready2Race;

model WorkShiftDto {
  // Work shift information
}

// Work shift including the users assigned to it
model WorkShiftWithAssignedUsersDto {
  id: uuid;
  event: uuid;
  title: string;
  timeFrom: dateTime;
  timeTo: dateTime;
  eventName: string;
  workType: uuid;
  workTypeName: string;
  minUser: int32;
  maxUser?: int32;
  remark?: string;
  createdAt: dateTime;
  updatedAt: dateTime;
  assignedUsers: AppUserNameDto[];
}

@route("/workShift")
@tag("WorkShift")
interface WorkShiftRoutes {
  // Work shift routes
}
