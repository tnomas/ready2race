import "@typespec/http";
import "@typespec/rest";

using TypeSpec.Http;
using TypeSpec.Rest;

namespace Ready2Race;

enum TaskState {
  OPEN;
  IN_PROGRESS;
  DONE;
  CANCELED;
}

// Task including the users responsible for it
// (backed by the task_with_responsible_users view)
model TaskDto {
  id: uuid;
  event: uuid;
  eventName: string;
  name: string;
  dueDate?: dateTime;
  description?: string;
  remark?: string;
  state: TaskState;
  createdAt: dateTime;
  updatedAt: dateTime;
  responsibleUsers: AppUserNameDto[];
}

@route("/task")
@tag("Task")
interface TaskRoutes {
  // Task routes
}
