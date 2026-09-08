import "@typespec/http";
import "@typespec/openapi";

using Http;
using OpenAPI;
namespace Ready2Race;

enum MaterialCategory {
  BOAT,
  OTHER,
}

enum MaterialItemStatus {
  ACTIVE,
  RETIRED,
}

model MaterialProviderDto {
  id: uuid;
  name: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  note?: string;
}

model MaterialProviderRequest {
  name: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  note?: string;
}

model MaterialTypeDto {
  id: uuid;
  name: string;
  category: MaterialCategory;
  description?: string;
}

model MaterialTypeRequest {
  name: string;
  category: MaterialCategory;
  description?: string;
}

model MaterialItemDto {
  id: uuid;
  materialProvider: uuid;
  materialProviderName: string;
  materialType: uuid;
  materialTypeName: string;
  category: MaterialCategory;
  number?: int32;
  label: string;
  note?: string;
  status: MaterialItemStatus;
  openDamages: int32;
}

model MaterialItemRequest {
  materialType: uuid;
  number?: int32;
  label: string;
  note?: string;
  status: MaterialItemStatus;
}

@route("/materialProvider")
@tag("Material")
interface MaterialRoutes {
  // Get paginated material providers
  @get
  @operationId("")
  getMaterialProviders(
    // Pagination parameters
  ): MaterialProviderDto[];

  // Add material provider
  @post
  @operationId("")
  addMaterialProvider(
    @body request: MaterialProviderRequest,
  ): uuid;

  // Get material provider by ID
  @get
  @route("/{providerId}")
  @operationId("")
  getMaterialProvider(
    @path providerId: string, // UUID
  ): MaterialProviderDto;

  // Update material provider
  @put
  @route("/{providerId}")
  @operationId("")
  updateMaterialProvider(
    @path providerId: string, // UUID
    @body request: MaterialProviderRequest,
  ): void;

  // Delete material provider
  @delete
  @route("/{providerId}")
  @operationId("")
  deleteMaterialProvider(
    @path providerId: string, // UUID
  ): void;

  // Get paginated material items of a provider
  @get
  @route("/{providerId}/item")
  @operationId("")
  getMaterialItems(
    @path providerId: string, // UUID
    // Pagination parameters
  ): MaterialItemDto[];

  // Add material item to a provider
  @post
  @route("/{providerId}/item")
  @operationId("")
  addMaterialItem(
    @path providerId: string, // UUID
    @body request: MaterialItemRequest,
  ): uuid;

  // Update material item
  @put
  @route("/{providerId}/item/{itemId}")
  @operationId("")
  updateMaterialItem(
    @path providerId: string, // UUID
    @path itemId: string, // UUID
    @body request: MaterialItemRequest,
  ): void;

  // Delete material item
  @delete
  @route("/{providerId}/item/{itemId}")
  @operationId("")
  deleteMaterialItem(
    @path providerId: string, // UUID
    @path itemId: string, // UUID
  ): void;
}

@route("/materialType")
@tag("Material")
interface MaterialTypeRoutes {
  // Get paginated material types
  @get
  @operationId("")
  getMaterialTypes(
    // Pagination parameters
  ): MaterialTypeDto[];

  // Add material type
  @post
  @operationId("")
  addMaterialType(
    @body request: MaterialTypeRequest,
  ): uuid;

  // Update material type
  @put
  @route("/{typeId}")
  @operationId("")
  updateMaterialType(
    @path typeId: string, // UUID
    @body request: MaterialTypeRequest,
  ): void;

  // Delete material type
  @delete
  @route("/{typeId}")
  @operationId("")
  deleteMaterialType(
    @path typeId: string, // UUID
  ): void;
}
