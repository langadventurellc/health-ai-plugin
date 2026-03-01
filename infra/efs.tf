# --- EFS File System ---

resource "aws_efs_file_system" "data" {
  encrypted = true

  tags = { Name = "${local.name_prefix}-efs" }
}

# --- Mount Targets (one per private subnet) ---

resource "aws_efs_mount_target" "data" {
  count = 2

  file_system_id  = aws_efs_file_system.data.id
  subnet_id       = aws_subnet.private[count.index].id
  security_groups = [aws_security_group.efs.id]
}

# --- Access Point ---
# UID/GID 1000 matches the Dockerfile's non-root 'node' user.

resource "aws_efs_access_point" "data" {
  file_system_id = aws_efs_file_system.data.id

  posix_user {
    uid = 1000
    gid = 1000
  }

  root_directory {
    path = "/app-data"

    creation_info {
      owner_uid   = 1000
      owner_gid   = 1000
      permissions = "0755"
    }
  }

  tags = { Name = "${local.name_prefix}-efs-ap" }
}
