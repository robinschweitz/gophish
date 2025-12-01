package models

/*
Design:

Gophish implements simple Role-Based-Access-Control (RBAC) to control access to
certain resources.

By default, Gophish has two separate roles, with each user being assigned to
a single role:

* Admin  - Can modify all objects as well as system-level configuration
* User   - Can modify all objects

It's important to note that these are global roles. In the future, we'll likely
add the concept of teams, which will include their own roles and permission
system similar to these global permissions.

Each role maps to one or more permissions, making it easy to add more granular
permissions over time.

This is supported through a simple API on a user object,
`HasPermission(Permission)`, which returns a boolean and an error.
This API checks the role associated with the user to see if that role has the
requested permission.
*/

const (
	// RoleAdmin is used for Gophish system administrators. Users with this
	// role have the ability to manage all objects within Gophish, as well as
	// system-level configuration, such as users and URLs.
	RoleAdmin = "admin"
	// RoleUser is used for standard Gophish users. Users with this role can
	// create, manage, and view Gophish objects and campaigns.
	RoleUser = "user"

	RoleTeamAdmin   = "team_admin"
	RoleContributor = "contributor"
	RoleViewer      = "viewer"

	PermissionViewTeamObjects   = "view_team_objects"
	PermissionModifyTeamObjects = "modify_team_objects"
	PermissionDeleteTeamObjects = "delete_team_objects"
	// PermissionViewObjects determines if a role can view standard Gophish
	// objects such as campaigns, groups, landing pages, etc.
	PermissionViewObjects = "view_objects"
	// PermissionModifyObjects determines if a role can create and modify
	// standard Gophish objects.
	PermissionModifyObjects = "modify_objects"
	// PermissionModifySystem determines if a role can manage system-level
	// configuration.
	PermissionModifySystem = "modify_system"
)

// Role represents a user role within Gophish. Each user has a single role
// which maps to a set of permissions.
type Role struct {
	ID          int64        `json:"-"`
	Slug        string       `json:"slug"`
	Name        string       `json:"name"`
	Description string       `json:"description"`
	Permissions []Permission `json:"-" gorm:"many2many:role_permissions;"`
}

// Permission determines what a particular role can do. Each role may have one
// or more permissions.
type Permission struct {
	ID          int64  `json:"id"`
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// GetRoleBySlug returns a role that can be assigned to a user.
func GetRoleBySlug(slug string) (Role, error) {
	role := Role{}
	err := db.Where("slug=?", slug).First(&role).Error

	return role, err
}

// HasPermission checks to see if the user has a role with the requested
// permission.
func (u *User) HasPermission(slug string) (bool, error) {
	perm := []Permission{}
	err := db.Model(Role{ID: u.RoleID}).Where("slug=?", slug).Association("Permissions").Find(&perm).Error
	if err != nil {
		return false, err
	}
	// Gorm doesn't return an ErrRecordNotFound whe scanning into a slice, so
	// we need to check the length (ref jinzhu/gorm#228)
	if len(perm) == 0 {
		return false, nil
	}
	return true, nil
}

// HasPermission checks to see if the user has a role with the requested
// permission.
func (u *User) HasTeamPermission(slug string, objectID int64, item string) (bool, error) {
	// Check team-specific permissions
	teamPerms := []Permission{}
	err := db.Table("permissions").Select("permissions.*").
		Joins("JOIN role_permissions ON role_permissions.permission_id = permissions.id").
		Joins("JOIN roles ON roles.id = role_permissions.role_id").
		Joins("JOIN team_users ON team_users.role_id = roles.id").
		Joins("JOIN item_teams ON item_teams.team_id = team_users.team_id").
		Where("team_users.user_id = ? AND item_teams.item_id = ? AND permissions.slug = ?", u.Id, objectID, slug).
		Find(&teamPerms).Error
	if err != nil {
		return false, err
	}
	// Gorm doesn't return an ErrRecordNotFound whe scanning into a slice, so
	// we need to check the length (ref jinzhu/gorm#228)
	if len(teamPerms) == 0 {
		return false, nil
	}
	return true, nil
}
